/**
 * ================================================================
 * 设备运行监控系统 - 统计 API（独立版，无外部依赖）
 * 功能：月统计、类型汇总、设备排行
 * ================================================================
 */

function success(data, message = '操作成功') {
    return new Response(
        JSON.stringify({ success: true, message, data }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

function error(message = '操作失败', status = 400) {
    return new Response(
        JSON.stringify({ success: false, error: message, data: null }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );
}

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
    const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1;
    const userId = url.searchParams.get('userId');
    const regionId = url.searchParams.get('regionId');

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return error('无效的日期参数', 400);
    }

    try {
        const startTime = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
        const endTime = Math.floor(new Date(year, month, 0, 23, 59, 59).getTime() / 1000);
        const now = Math.floor(Date.now() / 1000);

        // ============================================================
        // 1. 构建设备查询（支持区域过滤）
        // ============================================================
        let deviceSql = `
            SELECT d.id, d.name, d.tag, dt.name as type, d.status, d.current_start_time, d.region_id, r.name as region_name
            FROM devices d
            LEFT JOIN device_types dt ON d.type_id = dt.id
            LEFT JOIN regions r ON d.region_id = r.id
            WHERE d.is_deleted = 0
        `;
        const deviceParams = [];

        let userRegionId = null;

        if (userId) {
            const userStmt = env.DB.prepare(`
                SELECT role, region_id FROM users WHERE id = ?
            `);
            const user = await userStmt.bind(userId).first();

            if (user) {
                userRegionId = user.region_id;

                if (user.role === 'admin') {
                    if (regionId && regionId !== 'all' && regionId !== '') {
                        deviceSql += ` AND d.region_id = ?`;
                        deviceParams.push(parseInt(regionId));
                    }
                } else {
                    deviceSql += ` AND d.region_id = ?`;
                    deviceParams.push(user.region_id);
                }
            }
        } else if (regionId && regionId !== 'all' && regionId !== '') {
            deviceSql += ` AND d.region_id = ?`;
            deviceParams.push(parseInt(regionId));
        }

        deviceSql += ` ORDER BY d.id ASC`;

        const deviceStmt = env.DB.prepare(deviceSql);
        const devices = await deviceStmt.bind(...deviceParams).all();

        if (!devices.results || devices.results.length === 0) {
            return success({
                total_hours: 0,
                summary: [],
                ranking: [],
                year,
                month,
                region_id: userRegionId,
                region_name: null
            });
        }

        // ============================================================
        // 2. 用子查询查运行记录（避免 IN 参数过多）
        // ============================================================
        let subWhere = 'd.is_deleted = 0';
        const subParams = [];

        if (userId) {
            const userStmt = env.DB.prepare(`
                SELECT role, region_id FROM users WHERE id = ?
            `);
            const user = await userStmt.bind(userId).first();

            if (user) {
                if (user.role === 'admin') {
                    if (regionId && regionId !== 'all' && regionId !== '') {
                        subWhere += ` AND d.region_id = ?`;
                        subParams.push(parseInt(regionId));
                    }
                } else {
                    subWhere += ` AND d.region_id = ?`;
                    subParams.push(user.region_id);
                }
            }
        } else if (regionId && regionId !== 'all' && regionId !== '') {
            subWhere += ` AND d.region_id = ?`;
            subParams.push(parseInt(regionId));
        }

        let subSql = `
            SELECT
                r.device_id,
                r.start_time,
                r.end_time,
                r.duration_seconds
            FROM run_records r
            INNER JOIN devices d ON r.device_id = d.id
            WHERE r.start_time <= ?
              AND (r.end_time >= ? OR r.end_time IS NULL)
              AND ${subWhere}
        `;

        const allSubParams = [endTime, startTime, ...subParams];
        const recordStmt = env.DB.prepare(subSql);
        const records = await recordStmt.bind(...allSubParams).all();

        // ============================================================
        // 3. 计算每台设备运行时长
        // ============================================================
        const deviceHours = {};
        const deviceInfo = {};

        devices.results.forEach(d => {
            deviceHours[d.id] = 0;
            deviceInfo[d.id] = {
                name: d.name || `设备${d.id}`,
                tag: d.tag || '',
                type: d.type || '未分类',
                status: d.status || 0,
                region_id: d.region_id,
                region_name: d.region_name
            };
        });

        (records.results || []).forEach(r => {
            const deviceId = r.device_id;
            if (!deviceId || !deviceHours.hasOwnProperty(deviceId)) return;

            let start = r.start_time;
            let end = r.end_time;

            if (end === null) {
                end = Math.min(now, endTime);
            }

            if (start < startTime) start = startTime;
            if (end > endTime) end = endTime;

            if (end > start) {
                deviceHours[deviceId] += (end - start);
            }
        });

        const deviceHoursRounded = {};
        let totalHours = 0;

        Object.keys(deviceHours).forEach(id => {
            const seconds = deviceHours[id];
            const hours = seconds / 3600;
            const rounded = Math.round(hours);
            deviceHoursRounded[id] = rounded;
            totalHours += rounded;
        });

        const ranking = Object.keys(deviceHoursRounded)
            .map(id => ({
                device_id: parseInt(id),
                name: deviceInfo[id]?.name || `设备${id}`,
                tag: deviceInfo[id]?.tag || '',
                type: deviceInfo[id]?.type || '未分类',
                hours: deviceHoursRounded[id],
                status: deviceInfo[id]?.status || 0,
                region_id: deviceInfo[id]?.region_id || null,
                region_name: deviceInfo[id]?.region_name || null
            }))
            .sort((a, b) => b.hours - a.hours);

        const typeMap = {};
        ranking.forEach(item => {
            const type = item.type;
            if (!typeMap[type]) typeMap[type] = 0;
            typeMap[type] += item.hours;
        });

        const summary = Object.keys(typeMap)
            .map(type => ({ type, total_hours: typeMap[type] }))
            .sort((a, b) => b.total_hours - a.total_hours);

        let regionName = null;
        if (userRegionId) {
            const regionStmt = env.DB.prepare(`
                SELECT name FROM regions WHERE id = ?
            `);
            const region = await regionStmt.bind(userRegionId).first();
            regionName = region?.name || null;
        }

        return success({
            total_hours: totalHours,
            summary,
            ranking,
            year,
            month,
            region_id: userRegionId,
            region_name: regionName
        });
    } catch (err) {
        console.error('[Statistics] 查询失败:', err);
        return error('查询统计数据失败: ' + err.message, 500);
    }
}

export async function onRequest(context) {
    const { request } = context;
    const method = request.method;

    if (method === 'GET') {
        return onRequestGet(context);
    }

    return error('方法不允许', 405);
}
