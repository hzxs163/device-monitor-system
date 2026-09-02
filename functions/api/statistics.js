/**
 * ================================================================
 * 设备运行监控系统 - 统计 API（独立版，无外部依赖）
 * 功能：月统计、类型汇总、设备排行
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

// ================================================================
// GET /api/statistics/monthly - 月度统计
// ================================================================

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
    const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1;

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return error('无效的日期参数', 400);
    }

    try {
        const startTime = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
        const endTime = Math.floor(new Date(year, month, 0, 23, 59, 59).getTime() / 1000);
        const now = Math.floor(Date.now() / 1000);

        // 查询所有设备
        const deviceStmt = env.DB.prepare(`
            SELECT d.id, d.name, d.tag, dt.name as type, d.status, d.current_start_time
            FROM devices d
            LEFT JOIN device_types dt ON d.type_id = dt.id
            WHERE d.is_deleted = 0
            ORDER BY d.id ASC
        `);
        const devices = await deviceStmt.all();

        if (!devices.results || devices.results.length === 0) {
            return success({
                total_hours: 0,
                summary: [],
                ranking: [],
                year,
                month
            });
        }

        // 查询当月所有运行记录（包括正在运行的）
        const recordStmt = env.DB.prepare(`
            SELECT
                device_id,
                start_time,
                end_time,
                duration_seconds
            FROM run_records
            WHERE start_time <= ?
              AND (end_time >= ? OR end_time IS NULL)
        `);
        const records = await recordStmt.bind(endTime, startTime).all();

        // 计算每台设备运行时长
        const deviceHours = {};
        const deviceInfo = {};

        devices.results.forEach(d => {
            deviceHours[d.id] = 0;
            deviceInfo[d.id] = {
                name: d.name || `设备${d.id}`,
                tag: d.tag || '',
                type: d.type || '未分类',
                status: d.status || 0
            };
        });

        // 关键修复：对每条记录计算实际运行时长
        records.results.forEach(r => {
            const deviceId = r.device_id;
            if (!deviceId || !deviceHours.hasOwnProperty(deviceId)) return;

            let start = r.start_time;
            let end = r.end_time;

            // 如果还在运行中，用当前时间
            if (end === null) {
                end = Math.min(now, endTime);
            }

            // 截取当月部分
            if (start < startTime) start = startTime;
            if (end > endTime) end = endTime;

            if (end > start) {
                deviceHours[deviceId] += (end - start);
            }
        });

        // 转换为小时（取整）
        const deviceHoursRounded = {};
        let totalHours = 0;

        Object.keys(deviceHours).forEach(id => {
            const seconds = deviceHours[id];
            const hours = seconds / 3600;
            const rounded = Math.round(hours);
            deviceHoursRounded[id] = rounded;
            totalHours += rounded;
        });

        // 排行
        const ranking = Object.keys(deviceHoursRounded)
            .map(id => ({
                device_id: parseInt(id),
                name: deviceInfo[id]?.name || `设备${id}`,
                tag: deviceInfo[id]?.tag || '',
                type: deviceInfo[id]?.type || '未分类',
                hours: deviceHoursRounded[id],
                status: deviceInfo[id]?.status || 0
            }))
            .sort((a, b) => b.hours - a.hours);

        // 类型汇总
        const typeMap = {};
        ranking.forEach(item => {
            const type = item.type;
            if (!typeMap[type]) typeMap[type] = 0;
            typeMap[type] += item.hours;
        });

        const summary = Object.keys(typeMap)
            .map(type => ({ type, total_hours: typeMap[type] }))
            .sort((a, b) => b.total_hours - a.total_hours);

        return success({
            total_hours: totalHours,
            summary,
            ranking,
            year,
            month
        });
    } catch (err) {
        console.error('[Statistics] 查询失败:', err);
        return error('查询统计数据失败: ' + err.message, 500);
    }
}

// ================================================================
// 路由入口
// ================================================================
export async function onRequest(context) {
    const { request } = context;
    const method = request.method;

    if (method === 'GET') {
        return onRequestGet(context);
    }

    return error('方法不允许', 405);
}
