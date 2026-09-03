/**
 * ================================================================
 * 设备运行监控系统 - 运行记录 API（独立版）
 * ================================================================
 */

// 工具函数：成功响应
function success(data, message = '操作成功') {
    return new Response(
        JSON.stringify({ success: true, message, data }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

// 工具函数：错误响应
function error(message = '操作失败', status = 400) {
    return new Response(
        JSON.stringify({ success: false, error: message, data: null }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );
}

// 工具函数：解析 JSON
async function parseJSON(request) {
    try {
        return await request.json();
    } catch {
        return null;
    }
}

// ================================================================
// 权限校验：检查用户是否有权限操作该设备
// ================================================================
async function checkDevicePermission(env, deviceId, user) {
    if (!user) {
        return { allowed: false, error: '请先登录', status: 401 };
    }

    // 管理员：允许操作所有设备
    if (user.role === 'admin') {
        return { allowed: true, device: null };
    }

    // 普通用户：检查设备是否属于该用户所在区域
    try {
        const deviceStmt = env.DB.prepare(`
            SELECT id, name, tag, region_id
            FROM devices
            WHERE id = ? AND is_deleted = 0
        `);
        const device = await deviceStmt.bind(deviceId).first();

        if (!device) {
            return { allowed: false, error: '设备不存在', status: 404 };
        }

        // 检查设备是否属于用户区域
        if (device.region_id !== user.region_id) {
            return { 
                allowed: false, 
                error: '您没有权限操作该区域的设备', 
                status: 403 
            };
        }

        return { allowed: true, device };
    } catch (err) {
        console.error('[Records] 权限校验失败:', err);
        return { allowed: false, error: '权限校验失败', status: 500 };
    }
}

// ================================================================
// WxPusher 推送
// ================================================================
async function sendWxPusherNotification(env, deviceName, deviceTag, action, operatorName, duration = null) {
    try {
        const appToken = env.WXPUSHER_APP_TOKEN;
        const uid = env.WXPUSHER_UID;

        if (!appToken || !uid) {
            console.warn('[WxPusher] 未配置 appToken 或 uid，跳过推送');
            return;
        }

        const now = new Date();
        const timeStr = now.toLocaleString('zh-CN', { hour12: false });

        const actionText = action === 'start' ? '🟢 开机' : '🔴 停机';
        const durationText = duration !== null ? `，运行 ${formatDuration(duration)}` : '';

        const summary = `【设备监控】${deviceName} ${actionText}`;

        const content = `
            <div style="font-size: 14px; line-height: 1.8; padding: 8px 0;">
                <p><strong>设备名称</strong>：${deviceName}</p>
                <p><strong>位　　号</strong>：${deviceTag || '-'}</p>
                <p><strong>操　　作</strong>：${actionText}</p>
                <p><strong>操作人</strong>：${operatorName || '系统'}</p>
                <p><strong>操作时间</strong>：${timeStr}${durationText}</p>
            </div>
        `;

        const pushData = {
            appToken: appToken,
            summary: summary,
            content: content,
            contentType: 2,
            uids: [uid]
        };

        const response = await fetch('https://wxpusher.zjiecode.com/api/send/message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pushData),
        });

        const result = await response.json();
        if (result.code === 1000) {
            console.log('[WxPusher] 推送成功:', result);
        } else {
            console.warn('[WxPusher] 推送失败:', result);
        }
    } catch (err) {
        console.error('[WxPusher] 推送异常:', err);
    }
}

// ================================================================
// 开机
// ================================================================
async function handleStart(request, env, user) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { deviceId } = body;

    if (!deviceId || typeof deviceId !== 'number') {
        return error('设备 ID 不能为空', 400);
    }

    // ============================================================
    // 权限校验
    // ============================================================
    const permission = await checkDevicePermission(env, deviceId, user);
    if (!permission.allowed) {
        return error(permission.error, permission.status);
    }

    try {
        // 获取设备信息（权限校验已查过一次，但重新查一次确保最新状态）
        const deviceStmt = env.DB.prepare(`
            SELECT id, name, tag, status, current_start_time
            FROM devices
            WHERE id = ? AND is_deleted = 0
        `);
        const device = await deviceStmt.bind(deviceId).first();

        if (!device) {
            return error('设备不存在', 404);
        }

        if (device.status === 1) {
            return error('设备已在运行中', 400);
        }

        const now = Math.floor(Date.now() / 1000);

        const insertStmt = env.DB.prepare(`
            INSERT INTO run_records (device_id, start_time, operator_id)
            VALUES (?, ?, ?)
        `);
        await insertStmt.bind(deviceId, now, user?.id || 'system').run();

        const updateStmt = env.DB.prepare(`
            UPDATE devices SET status = 1, current_start_time = ? WHERE id = ?
        `);
        await updateStmt.bind(now, deviceId).run();

        // WxPusher 推送（开机）
        await sendWxPusherNotification(
            env,
            device.name,
            device.tag,
            'start',
            user?.nickname || user?.username || '系统'
        );

        // 记录普通用户操作日志
        if (user && user.role !== 'admin') {
            try {
                const logStmt = env.DB.prepare(`
                    INSERT INTO user_operations (device_id, device_name, device_tag, operator_id, operator_name, action, duration_seconds)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                await logStmt.bind(
                    deviceId,
                    device.name,
                    device.tag || '',
                    user.id,
                    user.nickname || user.username,
                    'start',
                    null
                ).run();
                console.log('[Records] 普通用户开机日志已记录:', user.username);
            } catch (logErr) {
                console.error('[Records] 记录开机日志失败:', logErr);
            }
        }

        return success({ deviceId, start_time: now }, `${device.name} 已开机`);
    } catch (err) {
        console.error('[Records] 开机失败:', err);
        return error('开机操作失败: ' + err.message, 500);
    }
}

// ================================================================
// 停机
// ================================================================
async function handleStop(request, env, user) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { deviceId } = body;

    if (!deviceId || typeof deviceId !== 'number') {
        return error('设备 ID 不能为空', 400);
    }

    // ============================================================
    // 权限校验
    // ============================================================
    const permission = await checkDevicePermission(env, deviceId, user);
    if (!permission.allowed) {
        return error(permission.error, permission.status);
    }

    try {
        const deviceStmt = env.DB.prepare(`
            SELECT id, name, tag, status, current_start_time
            FROM devices
            WHERE id = ? AND is_deleted = 0
        `);
        const device = await deviceStmt.bind(deviceId).first();

        if (!device) {
            return error('设备不存在', 404);
        }

        if (device.status === 0) {
            return error('设备已停机', 400);
        }

        if (!device.current_start_time) {
            return error('设备状态异常，无法停机', 400);
        }

        const now = Math.floor(Date.now() / 1000);
        const duration = now - device.current_start_time;

        const recordStmt = env.DB.prepare(`
            SELECT id FROM run_records
            WHERE device_id = ? AND end_time IS NULL
            ORDER BY start_time DESC LIMIT 1
        `);
        const record = await recordStmt.bind(deviceId).first();

        if (!record) {
            return error('未找到对应的运行记录', 400);
        }

        const updateStmt = env.DB.prepare(`
            UPDATE run_records SET end_time = ?, duration_seconds = ? WHERE id = ?
        `);
        await updateStmt.bind(now, duration, record.id).run();

        const deviceUpdateStmt = env.DB.prepare(`
            UPDATE devices SET status = 0, current_start_time = NULL WHERE id = ?
        `);
        await deviceUpdateStmt.bind(deviceId).run();

        // WxPusher 推送（停机）
        await sendWxPusherNotification(
            env,
            device.name,
            device.tag,
            'stop',
            user?.nickname || user?.username || '系统',
            duration
        );

        // 记录普通用户操作日志
        if (user && user.role !== 'admin') {
            try {
                const logStmt = env.DB.prepare(`
                    INSERT INTO user_operations (device_id, device_name, device_tag, operator_id, operator_name, action, duration_seconds)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                await logStmt.bind(
                    deviceId,
                    device.name,
                    device.tag || '',
                    user.id,
                    user.nickname || user.username,
                    'stop',
                    duration
                ).run();
                console.log('[Records] 普通用户停机日志已记录:', user.username);
            } catch (logErr) {
                console.error('[Records] 记录停机日志失败:', logErr);
            }
        }

        return success({
            deviceId,
            duration_seconds: duration,
            start_time: device.current_start_time,
            end_time: now
        }, `${device.name} 已停机`);
    } catch (err) {
        console.error('[Records] 停机失败:', err);
        return error('停机操作失败: ' + err.message, 500);
    }
}

// ================================================================
// 补录/修正运行记录
// ================================================================

async function handleCorrect(request, env, user) {
    // 允许所有用户操作（注释掉管理员权限检查）
    // if (!user || user.role !== 'admin') {
    //     return error('需要管理员权限', 403);
    // }

    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { deviceId, mode, startTime, endTime, stopTime, reason } = body;

    if (!deviceId || typeof deviceId !== 'number') {
        return error('设备 ID 不能为空', 400);
    }

    if (!reason || reason.trim() === '') {
        return error('请填写原因说明', 400);
    }

    // ============================================================
    // 权限校验（补录/修正也需要校验）
    // ============================================================
    const permission = await checkDevicePermission(env, deviceId, user);
    if (!permission.allowed) {
        return error(permission.error, permission.status);
    }

    const now = Math.floor(Date.now() / 1000);

    try {
        // 检查设备是否存在
        const deviceStmt = env.DB.prepare(`
            SELECT id, name, tag, status, current_start_time
            FROM devices
            WHERE id = ? AND is_deleted = 0
        `);
        const device = await deviceStmt.bind(deviceId).first();
        if (!device) {
            return error('设备不存在', 404);
        }

        if (mode === 'start') {
            // ============================================================
            // 模式1：补录运行（忘开机）
            // ============================================================
            if (!startTime || !endTime) {
                return error('请填写开始时间和结束时间', 400);
            }
            if (endTime <= startTime) {
                return error('结束时间必须大于开始时间', 400);
            }
            if (startTime > now || endTime > now) {
                return error('补录时间不能超过当前时间', 400);
            }

            // 检查时间段是否与已有记录重叠
            const overlapStmt = env.DB.prepare(`
                SELECT id, start_time, end_time
                FROM run_records
                WHERE device_id = ?
                  AND (
                      (start_time >= ? AND start_time < ?) OR
                      (end_time > ? AND end_time <= ?) OR
                      (start_time <= ? AND end_time >= ?)
                  )
                  AND is_corrected = 0
                LIMIT 1
            `);
            const overlap = await overlapStmt.bind(
                deviceId,
                startTime, endTime,
                startTime, endTime,
                startTime, endTime
            ).first();

            if (overlap) {
                const overlapStart = formatTimestamp(overlap.start_time);
                const overlapEnd = formatTimestamp(overlap.end_time || overlap.start_time);
                return error(`该时间段（${overlapStart} ~ ${overlapEnd}）已有运行记录，请勿重复补录`, 400);
            }

            const duration = endTime - startTime;
            const insertStmt = env.DB.prepare(`
                INSERT INTO run_records (device_id, start_time, end_time, duration_seconds, operator_id, is_corrected, correction_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            await insertStmt.bind(
                deviceId,
                startTime,
                endTime,
                duration,
                user.id,
                1,
                reason.trim()
            ).run();

            return success({
                mode: 'start',
                deviceId,
                start_time: startTime,
                end_time: endTime,
                duration_seconds: duration
            }, `补录运行成功，时长 ${formatDuration(duration)}`);

        } else if (mode === 'stop') {
            // ============================================================
            // 模式2：修正停机（忘停机）
            // ============================================================
            if (!stopTime) {
                return error('请填写实际停机时间', 400);
            }
            if (stopTime > now) {
                return error('停机时间不能超过当前时间', 400);
            }

            if (device.status === 0) {
                return error('设备当前已停机，无法修正停机时间', 400);
            }
            if (!device.current_start_time) {
                return error('设备状态异常，无法修正', 400);
            }
            if (stopTime <= device.current_start_time) {
                return error('停机时间必须大于开机时间', 400);
            }

            const recordStmt = env.DB.prepare(`
                SELECT id FROM run_records
                WHERE device_id = ? AND end_time IS NULL
                ORDER BY start_time DESC LIMIT 1
            `);
            const record = await recordStmt.bind(deviceId).first();
            if (!record) {
                return error('未找到对应的运行记录', 400);
            }

            const duration = stopTime - device.current_start_time;
            const updateStmt = env.DB.prepare(`
                UPDATE run_records
                SET end_time = ?, duration_seconds = ?, is_corrected = 1, correction_reason = ?
                WHERE id = ?
            `);
            await updateStmt.bind(stopTime, duration, reason.trim(), record.id).run();

            const deviceUpdateStmt = env.DB.prepare(`
                UPDATE devices SET status = 0, current_start_time = NULL WHERE id = ?
            `);
            await deviceUpdateStmt.bind(deviceId).run();

            return success({
                mode: 'stop',
                deviceId,
                start_time: device.current_start_time,
                end_time: stopTime,
                duration_seconds: duration
            }, `修正停机成功，本次运行 ${formatDuration(duration)}`);

        } else {
            return error('操作类型错误，请选择 "start" 或 "stop"', 400);
        }

    } catch (err) {
        console.error('[Records] 补录/修正失败:', err);
        return error('操作失败: ' + err.message, 500);
    }
}

// ================================================================
// 路由入口
// ================================================================
export async function onRequest(context) {
    const { request, env, user } = context;
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    console.log('[Records] 请求路径:', path, '方法:', method);

    // 补录/修正接口
    if (path.includes('/api/records/correct')) {
        if (method === 'POST') {
            return handleCorrect(request, env, user);
        }
        return error('方法不允许', 405);
    }

    if (path.includes('/api/records/')) {
        if (path.includes('/start')) {
            if (method === 'POST') {
                return handleStart(request, env, user);
            }
            return error('方法不允许', 405);
        }
        if (path.includes('/stop')) {
            if (method === 'POST') {
                return handleStop(request, env, user);
            }
            return error('方法不允许', 405);
        }
    }

    return error('接口不存在', 404);
}

// ================================================================
// 辅助函数
// ================================================================

function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0秒';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const parts = [];
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分`);
    if (secs > 0 && hours === 0) parts.push(`${secs}秒`);
    return parts.join('') || '0秒';
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '--';
    const date = new Date(timestamp * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
