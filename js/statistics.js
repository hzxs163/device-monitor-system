/**
 * ================================================================
 * 设备运行监控系统 - 前端统计报表模块
 * 功能：月统计、类型汇总、排行、导出
 * ================================================================
 */

import { get, showToast, formatHours, exportMonthlyReport } from './utils.js';
import { allDevices } from './devices.js';

// ================================================================
// 状态
// ================================================================

// 统计数据缓存
let statisticsData = {
    summary: [],      // 类型汇总 [{ type, total_hours }]
    ranking: [],      // 设备排行 [{ device_id, name, tag, type, hours, status }]
    total_hours: 0,   // 总运行小时
};

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

// ================================================================
// 1. 加载统计数据
// ================================================================

/**
 * 从服务器加载统计数据
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 * @param {boolean} silent - 是否静默加载
 * @returns {Promise<object>}
 */
export async function loadStatistics(year, month, silent = false) {
    year = year || currentYear;
    month = month || currentMonth;

    try {
        const result = await get(`/statistics/monthly?year=${year}&month=${month}`);

        if (!result.success) {
            if (!silent) {
                showToast(result.error || '加载统计数据失败', 'error');
            }
            return statisticsData;
        }

        const data = result.data || {};
        statisticsData.summary = data.summary || [];
        statisticsData.ranking = data.ranking || [];
        statisticsData.total_hours = data.total_hours || 0;

        // 保存到全局，供其他模块使用
        window.__statTotalHours = statisticsData.total_hours;

        // 更新统计栏
        updateStatsBar();

        return statisticsData;
    } catch (error) {
        console.error('[Statistics] 加载失败:', error);
        if (!silent) {
            showToast('加载统计数据异常', 'error');
        }
        return statisticsData;
    }
}

/**
 * 重新加载统计数据（强制刷新）
 */
export async function reloadStatistics() {
    return loadStatistics(currentYear, currentMonth, false);
}

// ================================================================
// 2. 更新统计栏
// ================================================================

/**
 * 更新顶部统计栏
 */
function updateStatsBar() {
    const totalHoursEl = document.getElementById('totalHours');
    const runningCountEl = document.getElementById('runningCount');

    if (totalHoursEl) {
        totalHoursEl.textContent = `${statisticsData.total_hours || 0} 小时`;
    }

    if (runningCountEl) {
        const running = allDevices?.filter(d => d.status === 1 && !d.is_deleted).length || 0;
        runningCountEl.textContent = `${running} 台`;
    }
}

// ================================================================
// 3. 渲染类型汇总卡片
// ================================================================

/**
 * 渲染类型汇总
 */
export function renderTypeSummary() {
    const container = document.getElementById('typeSummary');
    if (!container) return;

    const summary = statisticsData.summary || [];

    if (summary.length === 0) {
        container.innerHTML = `
            <div class="empty-state small">
                <p class="empty-text">暂无运行数据</p>
            </div>
        `;
        return;
    }

    // 找出最大值用于进度条
    const maxHours = Math.max(...summary.map(item => item.total_hours || 0), 1);

    container.innerHTML = summary.map(item => {
        const hours = item.total_hours || 0;
        const percent = maxHours > 0 ? (hours / maxHours) * 100 : 0;
        const isHighlight = hours === maxHours && hours > 0;

        return `
            <div class="type-summary-item ${isHighlight ? 'highlight' : ''}">
                <div class="type-name">${escapeHtml(item.type)}</div>
                <div class="type-hours">${hours} 小时</div>
                <div class="type-bar">
                    <div class="type-bar-fill" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ================================================================
// 4. 渲染设备排行表格
// ================================================================

/**
 * 渲染设备排行表格
 */
export function renderRankTable() {
    const container = document.getElementById('rankTable');
    if (!container) return;

    const ranking = statisticsData.ranking || [];

    if (ranking.length === 0) {
        container.innerHTML = `
            <div class="empty-state small">
                <p class="empty-text">暂无运行数据</p>
                <p class="empty-hint">本月还没有设备运行记录</p>
            </div>
        `;
        return;
    }

    // 只显示前 20 名
    const topList = ranking.slice(0, 20);

    let html = `
        <table class="rank-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>设备名称</th>
                    <th>位号</th>
                    <th>类型</th>
                    <th>本月运行</th>
                    <th>状态</th>
                </tr>
            </thead>
            <tbody>
    `;

    topList.forEach((item, index) => {
        const rank = index + 1;
        let rankClass = '';
        let rankDisplay = rank;

        if (rank === 1) {
            rankClass = 'gold';
            rankDisplay = '🥇';
        } else if (rank === 2) {
            rankClass = 'silver';
            rankDisplay = '🥈';
        } else if (rank === 3) {
            rankClass = 'bronze';
            rankDisplay = '🥉';
        }

        const statusClass = item.status === 1 ? 'running' : 'stopped';
        const statusText = item.status === 1 ? '🟢 运行中' : '⚪ 已停机';
        const hours = item.hours || 0;

        html += `
            <tr>
                <td><span class="rank-medal ${rankClass}">${rankDisplay}</span></td>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                <td>${escapeHtml(item.tag || '-')}</td>
                <td>${escapeHtml(item.type || '-')}</td>
                <td><strong>${hours} 小时</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    // 如果有更多设备，显示提示
    if (ranking.length > 20) {
        html += `<p class="text-muted text-center" style="margin-top:12px;font-size:14px;">仅显示前 20 名，共 ${ranking.length} 台设备</p>`;
    }

    container.innerHTML = html;
}

// ================================================================
// 5. 导出报表
// ================================================================

/**
 * 导出月报 Excel
 */
export function exportReport() {
    const ranking = statisticsData.ranking || [];

    if (ranking.length === 0) {
        showToast('没有数据可导出', 'warning');
        return;
    }

    const monthLabel = `${currentYear}年${currentMonth}月`;
    // 转换数据格式
    const data = ranking.map((item, index) => ({
        rank: index + 1,
        name: item.name,
        tag: item.tag || '-',
        typeName: item.type || '-',
        hours: item.hours || 0,
        statusText: item.status === 1 ? '运行中' : '已停机',
    }));

    exportMonthlyReport(data, monthLabel);
}

// ================================================================
// 6. 切换月份
// ================================================================

/**
 * 切换到指定月份
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 */
export async function switchMonth(year, month) {
    currentYear = year;
    currentMonth = month;

    // 更新月份显示
    const monthEl = document.getElementById('currentMonth');
    if (monthEl) {
        monthEl.textContent = `${year}年${month}月`;
    }

    // 重新加载数据
    await loadStatistics(year, month, false);
    renderTypeSummary();
    renderRankTable();
    updateStatsBar();

    showToast(`已切换到 ${year}年${month}月`, 'info');
}

// ================================================================
// 7. 工具函数
// ================================================================

/**
 * HTML 转义
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================================================================
// 8. 导出
// ================================================================

export {
    statisticsData,
    currentYear,
    currentMonth,
};

export default {
    loadStatistics,
    reloadStatistics,
    renderTypeSummary,
    renderRankTable,
    exportReport,
    switchMonth,
    statisticsData,
    currentYear,
    currentMonth,
};
