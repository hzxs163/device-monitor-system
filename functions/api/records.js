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
        const durationText = duration !== null ? `\n运行时长：${formatDuration(duration)}` : '';

        const content = `📢 **设备状态变更通知**\n\n` +
            `设备名称：${deviceName}\n` +
            `位　　号：${deviceTag || '-'}\n` +
            `操　　作：${actionText}\n` +
            `操作人：${operatorName || '系统'}\n` +
            `操作时间：${timeStr}${durationText}`;

        const pushData = {
            appToken: appToken,
            content: content,
            contentType: 1, // 1=文本
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
        if (result.success || result.code === 0) {
            console.log('[WxPusher] 推送成功:', result);
        } else {
            console.warn('[WxPusher] 推送失败:', result);
        }
    } catch (err) {
        console.error('[WxPusher] 推送异常:', err);
    }
}

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

        // ============================================================
        // WxPusher 推送（开机）
        // ============================================================
        await sendWxPusherNotification(
            env,
            device.name,
            device.tag,
            'start',
            user?.nickname || user?.username || '系统'
        );

        // ============================================================
        // 记录普通用户操作日志
        // ============================================================
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

        // ============================================================
        // WxPusher 推送（停机）
        // ============================================================
        await sendWxPusherNotification(
            env,
            device.name,
            device.tag,
            'stop',
            user?.nickname || user?.username || '系统',
            duration
        );

        // ============================================================
        // 记录普通用户操作日志
        // ============================================================
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
// 路由入口
// ================================================================
export async function onRequest(context) {
    const { request, env, user } = context;
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;

    console.log('[Records] 请求路径:', path, '方法:', method);

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
