/**
 * ================================================================
 * 设备运行监控系统 - 前端设备管理模块
 * 功能：加载设备、渲染卡片、类型标签、搜索、分页
 * ================================================================
 */

import { get, showToast, formatDuration, DEFAULT_PAGE_SIZE } from './utils.js';

// ================================================================
// 状态
// ================================================================

let allDevices = [];
let filteredDevices = [];
let currentType = 'all';
let searchKeyword = '';
let currentPage = 1;
let typeList = [];
let selectedDeviceId = null;
let onDeviceChange = null;

// 每页数量
const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const pageSize = DEFAULT_PAGE_SIZE;

// ================================================================
// 1. 加载设备列表
// ================================================================

export async function loadDevices(silent = false) {
    try {
        const result = await get('/devices');

        if (!result.success) {
            if (!silent) {
                showToast(result.error || '加载设备列表失败', 'error');
            }
            allDevices = [];
            filteredDevices = [];
            return [];
        }

        allDevices = result.data?.devices || [];
        typeList = result.data?.types || [];
        window.__devices = allDevices;  // ← 添加这行
        applyFilters();
        return allDevices;
    } catch (error) {
        console.error('[Devices] 加载失败:', error);
        if (!silent) {
            showToast('加载设备列表异常', 'error');
        }
        allDevices = [];
        filteredDevices = [];
        return [];
    }
}

export async function reloadDevices() {
    return loadDevices(false);
}

// ================================================================
// 2. 筛选逻辑
// ================================================================

function applyFilters() {
    let list = [...allDevices];

    if (currentType !== 'all') {
        list = list.filter(d => d.type === currentType);
    }

    if (searchKeyword.trim()) {
        const keyword = searchKeyword.trim().toLowerCase();
        list = list.filter(d =>
            d.name.toLowerCase().includes(keyword) ||
            (d.tag && d.tag.toLowerCase().includes(keyword))
        );
    }

    list.sort((a, b) => {
        if (a.status === 1 && b.status !== 1) return -1;
        if (a.status !== 1 && b.status === 1) return 1;
        return a.name.localeCompare(b.name);
    });

    filteredDevices = list;

    const totalPages = getTotalPages();
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }
}

// 修正：切换类型后重新渲染标签
export function switchType(type) {
    if (currentType === type) return;
    currentType = type;
    currentPage = 1;
    applyFilters();
    renderAll();
    renderTypeTabs();  // ← 重新渲染标签，更新 active 状态
}

export function filterDevices(keyword) {
    searchKeyword = keyword || '';
    currentPage = 1;
    applyFilters();
    renderAll();
}

// ================================================================
// 3. 分页
// ================================================================

export function getTotalPages() {
    return 1;
}

export function getCurrentPageDevices() {
    // 返回所有设备，不分页
    return filteredDevices;
}

export function goToPage(page) {
    // 禁用翻页
    return;
}

// ================================================================
// 4. 渲染函数
// ================================================================

export function renderAll() {
    renderDeviceCount();
    renderDevices();
    renderPagination();
}

export function renderDevices() {
    const grid = document.getElementById('deviceGrid');
    if (!grid) return;

    const devices = getCurrentPageDevices();

    if (devices.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p class="empty-text">暂无设备</p>
                <p class="empty-hint">请添加设备或调整筛选条件</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = devices.map(device => {
        const isRunning = device.status === 1;
        const statusText = isRunning ? '运行中' : '已停机';
        const statusClass = isRunning ? 'running' : 'stopped';

        // 本次运行时长
        const currentDuration = isRunning && device.current_start_time
            ? formatDuration(Math.floor(Date.now() / 1000) - device.current_start_time)
            : '--';

        // 本月运行时长（从统计数据中获取）
        const monthlyHours = device.monthly_hours || 0;
        const monthlyText = monthlyHours > 0 ? `${monthlyHours}小时` : '0小时';

        const actionBtn = isRunning
            ? `<button class="btn btn-stop" data-id="${device.id}" data-action="stop">停 机</button>`
            : `<button class="btn btn-start" data-id="${device.id}" data-action="start">开 机</button>`;

        return `
            <div class="device-card ${statusClass}" data-id="${device.id}">
                <div class="card-row">
                    <span class="device-name">${escapeHtml(device.name)}</span>
                    <span class="device-status">
                        <span class="status-dot ${statusClass}"></span>
                        ${statusText}
                    </span>
                </div>
                <div class="card-row">
                    <span class="device-tag">位号: ${escapeHtml(device.tag || '-')}</span>
                    <span class="device-type">${escapeHtml(device.type || '未分类')}</span>
                </div>
                <div class="card-row">
                    <span class="device-duration" style="display:flex;justify-content:space-between;font-size:var(--text-sm);gap:12px;">
                        <span>本月运行: ${monthlyText}</span>
                        <span>本次运行: ${currentDuration}</span>
                    </span>
                </div>
                <div class="card-actions">
                    ${actionBtn}
                </div>
            </div>
        `;
    }).join('');

    grid.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const deviceId = parseInt(btn.dataset.id);
            const action = btn.dataset.action;

            if (action === 'start') {
                handleStart(deviceId);
            } else if (action === 'stop') {
                handleStop(deviceId);
            }
        });
    });
}

export function renderTypeTabs() {
    const container = document.getElementById('typeTabs');
    if (!container) return;

    const types = getAllTypes();

    let html = `
        <button class="type-tab ${currentType === 'all' ? 'active' : ''}" data-type="all">
            全部 <span class="badge">${allDevices.filter(d => !d.is_deleted).length}</span>
        </button>
    `;

    types.forEach(type => {
        const count = allDevices.filter(d => d.type === type && !d.is_deleted).length;
        const isActive = currentType === type;
        html += `
            <button class="type-tab ${isActive ? 'active' : ''}" data-type="${escapeHtml(type)}">
                ${escapeHtml(type)} <span class="badge">${count}</span>
            </button>
        `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const type = tab.dataset.type;
            switchType(type);
        });
    });
}

export function renderPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;

    // 分页已禁用，清空分页控件
    container.innerHTML = '';
}

export function renderDeviceCount() {
    const el = document.getElementById('deviceCount');
    if (el) {
        const total = allDevices.filter(d => !d.is_deleted).length;
        const filtered = filteredDevices.length;
        el.textContent = filtered === total ? `共 ${total} 台` : `共 ${filtered} / ${total} 台`;
    }
}

// ================================================================
// 5. 辅助函数
// ================================================================

function getAllTypes() {
    const types = new Set();
    allDevices.forEach(d => {
        if (d.type && !d.is_deleted) {
            types.add(d.type);
        }
    });
    return Array.from(types).sort();
}

function getPageRange(current, total) {
    const range = [];
    const show = 5;

    if (total <= show) {
        for (let i = 1; i <= total; i++) range.push(i);
        return range;
    }

    range.push(1);

    let start = Math.max(2, current - 1);
    let end = Math.min(total - 1, current + 1);

    if (current <= 3) {
        end = Math.min(total - 1, 4);
    }
    if (current >= total - 2) {
        start = Math.max(2, total - 3);
    }

    if (start > 2) range.push('...');
    for (let i = start; i <= end; i++) range.push(i);
    if (end < total - 1) range.push('...');

    if (total > 1) range.push(total);

    return range;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ================================================================
// 6. 操作处理（开机/停机）
// ================================================================

async function handleStart(deviceId) {
    const { startDevice } = await import('./operations.js');
    await startDevice(deviceId);
}

async function handleStop(deviceId) {
    const { stopDevice } = await import('./operations.js');
    await stopDevice(deviceId);
}

// ================================================================
// 7. 设备状态更新
// ================================================================

export function updateDeviceLocal(deviceId, updates) {
    const device = allDevices.find(d => d.id === deviceId);
    if (device) {
        Object.assign(device, updates);
        applyFilters();
        renderAll();
        if (onDeviceChange) {
            onDeviceChange();
        }
    }
}

export function onDeviceChangeCallback(callback) {
    onDeviceChange = callback;
}

// ================================================================
// 8. 导出
// ================================================================

export {
    allDevices,
    filteredDevices,
    currentType,
    currentPage,
    pageSize,
    searchKeyword,
    typeList,
};

export default {
    loadDevices,
    reloadDevices,
    switchType,
    filterDevices,
    renderAll,
    renderDevices,
    renderTypeTabs,
    renderPagination,
    renderDeviceCount,
    getCurrentPageDevices,
    getTotalPages,
    goToPage,
    updateDeviceLocal,
    onDeviceChangeCallback,
    allDevices,
    filteredDevices,
    currentType,
    currentPage,
    searchKeyword,
    typeList,
};
