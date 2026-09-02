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
            window.__devices = [];
            window.__allTypes = [];
            return [];
        }

        allDevices = result.data?.devices || [];
        typeList = result.data?.types || [];
        window.__devices = allDevices;
        window.__allTypes = typeList;
        applyFilters();
        return allDevices;
    } catch (error) {
        console.error('[Devices] 加载失败:', error);
        if (!silent) {
            showToast('加载设备列表异常', 'error');
        }
        allDevices = [];
        filteredDevices = [];
        window.__devices = [];
        window.__allTypes = [];
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

export function switchType(type) {
    if (currentType === type) return;
    currentType = type;
    currentPage = 1;
    applyFilters();
    renderAll();
    renderTypeTabs();
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
    // 直接从 window.__devices 获取，确保数据最新
    const devices = window.__devices || [];
    let list = [...devices];
    
    // 按类型筛选
    if (currentType !== 'all') {
        list = list.filter(d => d.type === currentType);
    }
    
    // 按搜索关键词筛选
    if (searchKeyword.trim()) {
        const keyword = searchKeyword.trim().toLowerCase();
        list = list.filter(d =>
            d.name.toLowerCase().includes(keyword) ||
            (d.tag && d.tag.toLowerCase().includes(keyword))
        );
    }
    
    // 按状态排序（运行中排前面）
    list.sort((a, b) => {
        if (a.status === 1 && b.status !== 1) return -1;
        if (a.status !== 1 && b.status === 1) return 1;
        return a.name.localeCompare(b.name);
    });
    
    return list;
}

export function goToPage(page) {
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

    // 按类型分组
    const grouped = {};
    devices.forEach(device => {
        const type = device.type || '未分类';
        if (!grouped[type]) {
            grouped[type] = [];
        }
        grouped[type].push(device);
    });

    // ============================================================
    // 按 sort_order 排序
    // ============================================================
    let sortedTypes = [];
    
    if (window.__allTypes && window.__allTypes.length > 0) {
        const typeOrderMap = {};
        window.__allTypes.forEach((t, index) => {
            typeOrderMap[t.name] = t.sort_order !== undefined ? t.sort_order : index;
        });
        sortedTypes = Object.keys(grouped).sort((a, b) => {
            const orderA = typeOrderMap[a] !== undefined ? typeOrderMap[a] : 999;
            const orderB = typeOrderMap[b] !== undefined ? typeOrderMap[b] : 999;
            return orderA - orderB;
        });
    } else {
        sortedTypes = Object.keys(grouped).sort();
    }

    let html = '';

    sortedTypes.forEach(type => {
        const typeDevices = grouped[type];
        const total = typeDevices.length;
        const running = typeDevices.filter(d => d.status === 1).length;
        const stopped = total - running;
        const groupId = 'group-' + type.replace(/\s/g, '-') + '-' + Date.now();

        html += `
            <div class="type-group" data-group="${groupId}">
                <div class="type-group-header" onclick="window.toggleGroup('${groupId}')" style="cursor:pointer;">
                    <span class="type-group-name" id="${groupId}-arrow">▼ ${escapeHtml(type)}</span>
                    <span class="type-group-stats">
                        <span class="type-group-count">共 ${total} 台</span>
                        <span class="type-group-running">● ${running} 台开机</span>
                        <span class="type-group-stopped">○ ${stopped} 台停机</span>
                    </span>
                </div>
                <div class="type-group-grid" id="${groupId}-content">
        `;

        typeDevices.forEach(device => {
            const isRunning = device.status === 1;
            const statusText = isRunning ? '运行中' : '已停机';
            const statusClass = isRunning ? 'running' : 'stopped';

            const currentDuration = isRunning && device.current_start_time
                ? formatDuration(Math.floor(Date.now() / 1000) - device.current_start_time)
                : '--';

            const monthlyHours = device.monthly_hours || 0;
            const monthlyText = monthlyHours > 0 ? `${monthlyHours}小时` : '0小时';

            const actionBtn = isRunning
                ? `<button class="btn btn-stop" data-id="${device.id}" data-action="stop">停 机</button>`
                : `<button class="btn btn-start" data-id="${device.id}" data-action="start">开 机</button>`;

            html += `
                <div class="device-card ${statusClass}" data-id="${device.id}" style="cursor:pointer;">
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
                        <span class="device-tag">型号: ${escapeHtml(device.model || '-')}</span>
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
        });

        html += `
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;

    // 绑定卡片双击事件（排除按钮点击）
    grid.querySelectorAll('.device-card').forEach(card => {
        card.addEventListener('dblclick', function(e) {
            if (e.target.closest('.btn-start') || e.target.closest('.btn-stop')) {
                return;
            }
            const deviceId = parseInt(this.dataset.id);
            if (typeof window.showDeviceDetail === 'function') {
                window.showDeviceDetail(deviceId);
            }
        });
    });

    // 绑定卡片按钮事件
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
