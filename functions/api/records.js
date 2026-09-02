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
// 开机
// ================================================================
async function handleStart(request, env) {
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
            SELECT id, name, status, current_start_time
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
        await insertStmt.bind(deviceId, now, 'system').run();

        const updateStmt = env.DB.prepare(`
            UPDATE devices SET status = 1, current_start_time = ? WHERE id = ?
        `);
        await updateStmt.bind(now, deviceId).run();

        return success({ deviceId, start_time: now }, `${device.name} 已开机`);
    } catch (err) {
        console.error('[Records] 开机失败:', err);
        return error('开机操作失败: ' + err.message, 500);
    }
}

// ================================================================
// 停机
// ================================================================
async function handleStop(request, env) {
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
            SELECT id, name, status, current_start_time
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
    const { request, env } = context;
    const url = new URL(request.url);
    const method = request.method;

    console.log('[Records] 请求:', url.pathname, method);

    if (url.pathname === '/api/records/start') {
        if (method === 'POST') {
            return handleStart(request, env);
        }
        return error('方法不允许', 405);
    }

    if (url.pathname === '/api/records/stop') {
        if (method === 'POST') {
            return handleStop(request, env);
        }
        return error('方法不允许', 405);
    }

    return error('接口不存在', 404);
}
