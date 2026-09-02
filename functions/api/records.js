/**
 * ================================================================
 * 设备运行监控系统 - 运行记录 API
 * 功能：开机、停机、获取设备状态
 * ================================================================
 */

import { success, error, parseJSON } from '../utils/response.js';

// ================================================================
// 1. POST /api/records/start - 开机
// ================================================================

export async function onRequestPostStart({ request, env, user }) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { deviceId } = body;

    if (!deviceId || typeof deviceId !== 'number') {
        return error('设备 ID 不能为空', 400);
    }

    try {
        // 1. 查询设备是否存在且未删除
        const deviceStmt = env.DB.prepare(`
            SELECT id, name, status, current_start_time
            FROM devices
            WHERE id = ? AND is_deleted = 0
        `);
        const device = await deviceStmt.bind(deviceId).first();

        if (!device) {
            return error('设备不存在', 404);
        }

        // 2. 检查设备是否已在运行中
        if (device.status === 1) {
            return error('设备已在运行中', 400);
        }

        // 3. 获取当前时间戳（秒）
        const now = Math.floor(Date.now() / 1000);
        const operatorId = user?.id || 'system';

        // 4. 插入运行记录
        const insertStmt = env.DB.prepare(`
            INSERT INTO run_records (device_id, start_time, operator_id)
            VALUES (?, ?, ?)
        `);
        const result = await insertStmt.bind(deviceId, now, operatorId).run();

        // 5. 更新设备状态
        const updateStmt = env.DB.prepare(`
            UPDATE devices
            SET status = 1, current_start_time = ?
            WHERE id = ?
        `);
        await updateStmt.bind(now, deviceId).run();

        return success({
            deviceId: deviceId,
            start_time: now,
            record_id: result.meta?.last_row_id || null,
        }, `${device.name} 已开机`);
    } catch (err) {
        console.error('[Records] 开机失败:', err);
        return error('开机操作失败', 500);
    }
}

// ================================================================
// 2. POST /api/records/stop - 停机
// ================================================================

export async function onRequestPostStop({ request, env, user }) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { deviceId } = body;

    if (!deviceId || typeof deviceId !== 'number') {
        return error('设备 ID 不能为空', 400);
    }

    try {
        // 1. 查询设备是否存在且正在运行
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

        // 2. 获取当前时间戳（秒）
        const now = Math.floor(Date.now() / 1000);
        const startTime = device.current_start_time;

        // 3. 计算运行时长（秒）
        const duration = now - startTime;

        // 4. 查找未结束的运行记录
        const recordStmt = env.DB.prepare(`
            SELECT id
            FROM run_records
            WHERE device_id = ? AND end_time IS NULL
            ORDER BY start_time DESC
            LIMIT 1
        `);
        const record = await recordStmt.bind(deviceId).first();

        if (!record) {
            return error('未找到对应的运行记录', 400);
        }

        // 5. 更新运行记录（写入结束时间和时长）
        const updateStmt = env.DB.prepare(`
            UPDATE run_records
            SET end_time = ?, duration_seconds = ?
            WHERE id = ?
        `);
        await updateStmt.bind(now, duration, record.id).run();

        // 6. 更新设备状态
        const deviceUpdateStmt = env.DB.prepare(`
            UPDATE devices
            SET status = 0, current_start_time = NULL
            WHERE id = ?
        `);
        await deviceUpdateStmt.bind(deviceId).run();

        return success({
            deviceId: deviceId,
            duration_seconds: duration,
            start_time: startTime,
            end_time: now,
            record_id: record.id,
        }, `${device.name} 已停机，本次运行 ${formatDuration(duration)}`);
    } catch (err) {
        console.error('[Records] 停机失败:', err);
        return error('停机操作失败', 500);
    }
}

// ================================================================
// 3. GET /api/records/status/:id - 获取设备运行状态
// ================================================================

export async function onRequestGetStatus({ env, params }) {
    const deviceId = parseInt(params.id);
    if (!deviceId || isNaN(deviceId)) {
        return error('无效的设备 ID', 400);
    }

    try {
        const stmt = env.DB.prepare(`
            SELECT id, name, status, current_start_time
            FROM devices
            WHERE id = ? AND is_deleted = 0
        `);
        const device = await stmt.bind(deviceId).first();

        if (!device) {
            return error('设备不存在', 404);
        }

        let currentDuration = null;
        if (device.status === 1 && device.current_start_time) {
            const now = Math.floor(Date.now() / 1000);
            currentDuration = now - device.current_start_time;
        }

        return success({
            id: device.id,
            name: device.name,
            status: device.status,
            current_start_time: device.current_start_time,
            current_duration_seconds: currentDuration,
        });
    } catch (err) {
        console.error('[Records] 查询状态失败:', err);
        return error('查询设备状态失败', 500);
    }
}

// ================================================================
// 4. 路由分发
// ================================================================

export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const method = request.method;

    // 路由匹配: /api/records/status/:id
    if (url.pathname.match(/^\/api\/records\/status\/\d+$/)) {
        if (method === 'GET') {
            return onRequestGetStatus(context);
        }
        return error('方法不允许', 405);
    }

    // /api/records/start
    if (url.pathname === '/api/records/start') {
        if (method === 'POST') {
            return onRequestPostStart(context);
        }
        return error('方法不允许', 405);
    }

    // /api/records/stop
    if (url.pathname === '/api/records/stop') {
        if (method === 'POST') {
            return onRequestPostStop(context);
        }
        return error('方法不允许', 405);
    }

    return error('接口不存在', 404);
}

// ================================================================
// 辅助函数
// ================================================================

/**
 * 格式化时长（秒 → 可读字符串）
 */
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
