/**
 * ================================================================
 * 设备运行监控系统 - 前端设备操作模块
 * 功能：开机、停机
 * ================================================================
 */

import { post, showToast } from './utils.js';
import { updateDeviceLocal } from './devices.js';
import { getCurrentUserSync } from './auth.js';

// ================================================================
// 状态
// ================================================================

// 正在操作的设备 ID 集合（防止重复点击）
const operatingSet = new Set();

// 只更新统计栏，不刷新整个页面
function updateStatsBarOnly() {
    const devices = window.__devices || [];
    const running = devices.filter(d => d.status === 1 && !d.is_deleted).length;
    const runningCountEl = document.getElementById('runningCount');
    if (runningCountEl) {
        runningCountEl.textContent = `${running} 台`;
    }
}

// ================================================================
// 1. 开机
// ================================================================

/**
 * 启动设备
 * @param {number} deviceId - 设备 ID
 * @returns {Promise<{success: boolean}>}
 */
export async function startDevice(deviceId) {
    // 防重复点击
    if (operatingSet.has(deviceId)) {
        showToast('操作进行中，请稍候', 'warning');
        return { success: false };
    }

    // 检查设备是否存在且已停机
    const device = window.__devices?.find(d => d.id === deviceId);
    if (device && device.status === 1) {
        showToast('设备已在运行中', 'warning');
        return { success: false };
    }

    // 获取当前用户信息
    const user = getCurrentUserSync();
    if (!user) {
        showToast('请先登录', 'error');
        return { success: false };
    }

    operatingSet.add(deviceId);

    try {
        // 请求时带上 userId 和 regionId
        const result = await post('/api/records/start', {
            deviceId,
            userId: user.id,
            regionId: user.region_id
        });

        if (!result.success) {
            showToast(result.error || '开机失败', 'error');
            return { success: false };
        }

        // 本地更新设备状态
        if (result.data) {
            updateDeviceLocal(deviceId, {
                status: 1,
                current_start_time: result.data.start_time,
            });
        }

        showToast(`✅ ${device?.name || '设备'} 已开机`, 'success');

        // 触发设备操作事件，刷新操作记录
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new Event('deviceOperation'));
        }

        // 更新统计栏（只更新运行台数）
        updateStatsBarOnly();

        return { success: true };
    } catch (error) {
        console.error('[Operations] 开机失败:', error);
        showToast('开机异常，请稍后重试', 'error');
        return { success: false };
    } finally {
        operatingSet.delete(deviceId);
    }
}

// ================================================================
// 2. 停机
// ================================================================

/**
 * 停止设备
 * @param {number} deviceId - 设备 ID
 * @returns {Promise<{success: boolean}>}
 */
export async function stopDevice(deviceId) {
    // 防重复点击
    if (operatingSet.has(deviceId)) {
        showToast('操作进行中，请稍候', 'warning');
        return { success: false };
    }

    // 检查设备是否存在且正在运行
    const device = window.__devices?.find(d => d.id === deviceId);
    if (device && device.status === 0) {
        showToast('设备已停机', 'warning');
        return { success: false };
    }

    // 获取当前用户信息
    const user = getCurrentUserSync();
    if (!user) {
        showToast('请先登录', 'error');
        return { success: false };
    }

    operatingSet.add(deviceId);

    try {
        // 请求时带上 userId 和 regionId
        const result = await post('/api/records/stop', {
            deviceId,
            userId: user.id,
            regionId: user.region_id
        });

        if (!result.success) {
            showToast(result.error || '停机失败', 'error');
            return { success: false };
        }

        // 本地更新设备状态
        updateDeviceLocal(deviceId, {
            status: 0,
            current_start_time: null,
        });

        // 显示本次运行时长
        const duration = result.data?.duration_seconds;
        const durationText = duration ? formatDuration(duration) : '';
        showToast(
            `⏹️ ${device?.name || '设备'} 已停机${durationText ? `，本次运行 ${durationText}` : ''}`,
            'success'
        );

        // 触发设备操作事件，刷新操作记录
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new Event('deviceOperation'));
        }

        // 更新统计栏（只更新运行台数）
        updateStatsBarOnly();

        return { success: true };
    } catch (error) {
        console.error('[Operations] 停机失败:', error);
        showToast('停机异常，请稍后重试', 'error');
        return { success: false };
    } finally {
        operatingSet.delete(deviceId);
    }
}

// ================================================================
// 3. 重新加载设备（操作后刷新）
// ================================================================

/**
 * 操作后刷新设备列表和统计
 */
export async function refreshAfterOperation() {
    const { loadDevices, renderAll } = await import('./devices.js');
    await loadDevices(true);
    renderAll();

    // 触发统计更新
    const { loadStatistics, renderTypeSummary, renderRankTable } = await import('./statistics.js');
    await loadStatistics();
    renderTypeSummary();
    renderRankTable();

    // 更新统计栏
    const totalHoursEl = document.getElementById('totalHours');
    const runningCountEl = document.getElementById('runningCount');
    if (totalHoursEl) {
        const total = window.__statTotalHours || 0;
        totalHoursEl.textContent = `${total} 小时`;
    }
    if (runningCountEl) {
        const running = window.__devices?.filter(d => d.status === 1 && !d.is_deleted).length || 0;
        runningCountEl.textContent = `${running} 台`;
    }
}

// ================================================================
// 4. 工具函数
// ================================================================

/**
 * 格式化时长（秒 → 可读字符串）
 * @param {number} seconds - 秒数
 * @returns {string}
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

/**
 * 检查设备是否正在操作中
 */
export function isOperating(deviceId) {
    return operatingSet.has(deviceId);
}

// ================================================================
// 导出
// ================================================================
export default {
    startDevice,
    stopDevice,
    refreshAfterOperation,
    isOperating,
};
