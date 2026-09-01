/**
 * ================================================================
 * 设备运行监控系统 - 统计 API
 * 功能：月统计、类型汇总、设备排行
 * ================================================================
 */

import { success, error, unauthorized } from '../utils/response.js';

// ================================================================
// GET /api/statistics/monthly - 月度统计
// ================================================================

export async function onRequestGet({ request, env, user }) {
    if (!user) {
        return unauthorized('请先登录');
    }

    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
    const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1;

    // 参数校验
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return error('无效的日期参数', 400);
    }

    try {
        // 计算月份起止时间戳（秒）
        const startTime = Math.floor(new Date(year, month - 1, 1).getTime() / 1000);
        const endTime = Math.floor(new Date(year, month, 0, 23, 59, 59).getTime() / 1000);

        // ============================================================
        // 1. 查询所有设备（含当前状态）
        // ============================================================
        const deviceStmt = env.DB.prepare(`
            SELECT
                d.id,
                d.name,
                d.tag,
                dt.name as type,
                d.status,
                d.current_start_time
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
            }, '暂无设备');
        }

        // ============================================================
        // 2. 查询当月所有运行记录
        // ============================================================
        const recordStmt = env.DB.prepare(`
            SELECT
                device_id,
                start_time,
                end_time,
                duration_seconds
            FROM run_records
            WHERE start_time <= ?
              AND (end_time >= ? OR end_time IS NULL)
              AND duration_seconds IS NOT NULL
        `);
        const records = await recordStmt.bind(endTime, startTime).all();

        // ============================================================
        // 3. 计算每台设备的当月运行时长
        // ============================================================
        const deviceHours = {};
        const deviceNames = {};
        const deviceTags = {};
        const deviceTypes = {};
        const deviceStatus = {};
        const deviceCurrentStart = {};

        // 初始化设备信息
        devices.results.forEach(d => {
            deviceHours[d.id] = 0;
            deviceNames[d.id] = d.name || `设备${d.id}`;
            deviceTags[d.id] = d.tag || '';
            deviceTypes[d.id] = d.type || '未分类';
            deviceStatus[d.id] = d.status || 0;
            deviceCurrentStart[d.id] = d.current_start_time || null;
        });

        // 汇总每台设备的运行秒数
        records.results.forEach(r => {
            const deviceId = r.device_id;
            if (!deviceId || !deviceHours.hasOwnProperty(deviceId)) return;

            let start = r.start_time;
            let end = r.end_time;

            // 跨月切割：只统计当月的部分
            if (start < startTime) start = startTime;
            if (end === null || end > endTime) end = endTime;

            if (end > start) {
                deviceHours[deviceId] += (end - start);
            }
        });

        // ============================================================
        // 4. 转换为小时（取整：≥45分钟进1小时）
        // ============================================================
        const deviceHoursRounded = {};
        let totalHours = 0;

        Object.keys(deviceHours).forEach(id => {
            const seconds = deviceHours[id];
            const hours = seconds / 3600;
            // 四舍五入到最接近的整数（≥0.75小时 即45分钟进1小时）
            const rounded = Math.round(hours);
            deviceHoursRounded[id] = rounded;
            totalHours += rounded;
        });

        // ============================================================
        // 5. 构建设备排行（按小时降序）
        // ============================================================
        const ranking = Object.keys(deviceHoursRounded)
            .map(id => ({
                device_id: parseInt(id),
                name: deviceNames[id] || `设备${id}`,
                tag: deviceTags[id] || '',
                type: deviceTypes[id] || '未分类',
                hours: deviceHoursRounded[id],
                status: deviceStatus[id] || 0,
            }))
            .sort((a, b) => b.hours - a.hours);

        // ============================================================
        // 6. 构建类型汇总
        // ============================================================
        const typeMap = {};
        ranking.forEach(item => {
            const type = item.type;
            if (!typeMap[type]) {
                typeMap[type] = 0;
            }
            typeMap[type] += item.hours;
        });

        const summary = Object.keys(typeMap)
            .map(type => ({
                type: type,
                total_hours: typeMap[type],
            }))
            .sort((a, b) => b.total_hours - a.total_hours);

        // ============================================================
        // 7. 返回结果
        // ============================================================
        return success({
            total_hours: totalHours,
            summary: summary,
            ranking: ranking,
            year: year,
            month: month,
        });
    } catch (err) {
        console.error('[Statistics] 查询失败:', err);
        return error('查询统计数据失败', 500);
    }
}

// ================================================================
// 导出
// ================================================================

export default {
    onRequestGet,
};
