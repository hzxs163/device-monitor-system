/**
 * ================================================================
 * 设备运行监控系统 - 导出 Excel 模块
 * 功能：导出设备运行月报（使用 CDN 加载 xlsx）
 * ================================================================
 */

// 使用 CDN 加载 xlsx 库
const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

let XLSX = null;

/**
 * 加载 xlsx 库
 */
async function loadXLSX() {
    if (XLSX) return XLSX;
    try {
        // 动态导入 CDN 脚本
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = XLSX_URL;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        // 获取全局 XLSX 对象
        XLSX = window.XLSX;
        return XLSX;
    } catch (err) {
        console.error('加载 xlsx 库失败:', err);
        throw new Error('加载 Excel 导出库失败，请检查网络');
    }
}

/**
 * 导出设备运行月报
 * @param {Array} devices - 设备列表（含 monthly_hours）
 * @param {number} year - 年份
 * @param {number} month - 月份
 */
export async function exportMonthlyReport(devices, year, month) {
    if (!devices || devices.length === 0) {
        alert('没有数据可导出');
        return;
    }

    // 加载 xlsx 库
    const XLSXLib = await loadXLSX();
    if (!XLSXLib) {
        alert('加载 Excel 导出库失败，请刷新页面重试');
        return;
    }

    const monthLabel = `${year}年${month}月`;

    // ============================================================
    // Sheet 1: 本月运行统计
    // ============================================================
    const rankingData = devices
        .filter(d => !d.is_deleted)
        .map((d, index) => ({
            '排名': index + 1,
            '设备名称': d.name,
            '位号': d.tag || '-',
            '设备类型': d.type || '未分类',
            '本月运行(小时)': d.monthly_hours || 0,
            '当前状态': d.status === 1 ? '运行中' : '已停机',
            '本次运行': d.status === 1 && d.current_start_time
                ? formatDuration(Math.floor(Date.now() / 1000) - d.current_start_time)
                : '--'
        }))
        .sort((a, b) => b['本月运行(小时)'] - a['本月运行(小时)']);

    const ws1 = XLSXLib.utils.json_to_sheet(rankingData);
    ws1['!cols'] = [
        { wch: 6 },   // 排名
        { wch: 16 },  // 设备名称
        { wch: 12 },  // 位号
        { wch: 12 },  // 设备类型
        { wch: 16 },  // 本月运行
        { wch: 10 },  // 当前状态
        { wch: 14 },  // 本次运行
    ];

    // ============================================================
    // Sheet 2: 按类型汇总
    // ============================================================
    const typeMap = {};
    devices.filter(d => !d.is_deleted).forEach(d => {
        const type = d.type || '未分类';
        if (!typeMap[type]) {
            typeMap[type] = { total: 0, running: 0, stopped: 0 };
        }
        typeMap[type].total += d.monthly_hours || 0;
        if (d.status === 1) {
            typeMap[type].running += 1;
        } else {
            typeMap[type].stopped += 1;
        }
    });

    const summaryData = Object.keys(typeMap).map(type => ({
        '设备类型': type,
        '设备数量': devices.filter(d => !d.is_deleted && (d.type || '未分类') === type).length,
        '本月总运行(小时)': typeMap[type].total,
        '运行中(台)': typeMap[type].running,
        '已停机(台)': typeMap[type].stopped,
    })).sort((a, b) => b['本月总运行(小时)'] - a['本月总运行(小时)']);

    const ws2 = XLSXLib.utils.json_to_sheet(summaryData);
    ws2['!cols'] = [
        { wch: 14 },  // 设备类型
        { wch: 10 },  // 设备数量
        { wch: 18 },  // 本月总运行
        { wch: 12 },  // 运行中
        { wch: 12 },  // 已停机
    ];

    // ============================================================
    // Sheet 3: 设备明细
    // ============================================================
    const detailData = devices.filter(d => !d.is_deleted).map(d => {
        const params = parseParams(d.params);
        const paramStr = params ? Object.keys(params).map(k => `${k}:${params[k]}`).join('; ') : '';
        return {
            '设备名称': d.name,
            '位号': d.tag || '-',
            '设备类型': d.type || '未分类',
            '位置': d.location || '-',
            '当前状态': d.status === 1 ? '运行中' : '已停机',
            '本月运行': `${d.monthly_hours || 0}小时`,
            '本次运行': d.status === 1 && d.current_start_time
                ? formatDuration(Math.floor(Date.now() / 1000) - d.current_start_time)
                : '--',
            '设备参数': paramStr || '-',
        };
    });

    const ws3 = XLSXLib.utils.json_to_sheet(detailData);
    ws3['!cols'] = [
        { wch: 16 },  // 设备名称
        { wch: 12 },  // 位号
        { wch: 12 },  // 设备类型
        { wch: 10 },  // 位置
        { wch: 10 },  // 当前状态
        { wch: 12 },  // 本月运行
        { wch: 14 },  // 本次运行
        { wch: 30 },  // 设备参数
    ];

    // ============================================================
    // 创建工作簿
    // ============================================================
    const wb = XLSXLib.utils.book_new();
    XLSXLib.utils.book_append_sheet(wb, ws1, '本月运行统计');
    XLSXLib.utils.book_append_sheet(wb, ws2, '按类型汇总');
    XLSXLib.utils.book_append_sheet(wb, ws3, '设备明细');

    // ============================================================
    // 导出文件
    // ============================================================
    const fileName = `设备运行月报_${monthLabel}.xlsx`;
    XLSXLib.writeFile(wb, fileName);

    alert(`✅ 报表已导出：${fileName}`);
}

// ============================================================
// 辅助函数
// ============================================================

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

function parseParams(params) {
    if (!params) return null;
    try {
        return typeof params === 'string' ? JSON.parse(params) : params;
    } catch (e) {
        return null;
    }
}

// ============================================================
// 暴露到全局，供 HTML 按钮直接调用
// ============================================================

window.exportMonthlyReport = exportMonthlyReport;
