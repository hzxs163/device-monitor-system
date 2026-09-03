/**
 * ================================================================
 * 设备运行监控系统 - 前端设备管理模块
 * 功能：加载设备、渲染卡片、类型标签、搜索、分页、区域过滤
 * ================================================================
 */

import { get, showToast, formatDuration, DEFAULT_PAGE_SIZE } from './utils.js';
import { getUserRegionId, getUserRegionName, isAdminSync, getCurrentUserSync } from './auth.js';

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
let currentRegionId = 'all'; // 'all' 或具体区域ID

// 每页数量
const PAGE_SIZE = DEFAULT_PAGE_SIZE;
const pageSize = DEFAULT_PAGE_SIZE;

// ================================================================
// 1. 加载设备列表（支持区域过滤）
// ================================================================

export async function loadDevices(silent = false) {
    try {
        // 获取当前用户信息
        const user = getCurrentUserSync();
        const isAdmin = isAdminSync();
        
        // 构建查询参数
        let url = '/devices';
        const params = new URLSearchParams();
        
        // 管理员：如果有区域筛选则传递 regionId
        if (isAdmin && currentRegionId && currentRegionId !== 'all') {
            params.append('regionId', currentRegionId);
        }
        
        // 传递 userId 用于后端权限判断
        if (user && user.id) {
            params.append('userId', user.id);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }

        const result = await get(url);

        if (!result.success) {
            if (!silent) {
                showToast(result.error || '加载设备列表失败', 'error');
            }
            allDevices = [];
            filteredDevices = [];
            window.__devices = [];
            window.__allTypes = [];
            window.__allRegions = [];
            return [];
        }

        allDevices = result.data?.devices || [];
        typeList = result.data?.types || [];
        const regions = result.data?.regions || [];
        window.__devices = allDevices;
        window.__allTypes = typeList;
        window.__allRegions = regions;
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
        window.__allRegions = [];
        return [];
    }
}

export async function reloadDevices() {
    return loadDevices(false);
}

// ================================================================
// 2. 设置区域筛选
// ================================================================

export function setRegionFilter(regionId) {
    currentRegionId = regionId || 'all';
    currentPage = 1;
    // 重新加载设备
    loadDevices().then(() => {
        renderAll();
        renderTypeTabs();
        // 触发统计刷新
        if (typeof window.loadStatistics === 'function') {
            window.loadStatistics().then(() => {
                if (typeof window.renderTypeSummary === 'function') {
                    window.renderTypeSummary();
                }
                if (typeof window.renderRankTable === 'function') {
                    window.renderRankTable();
                }
                if (typeof window.updateStatsBar === 'function') {
                    window.updateStatsBar();
                }
            });
        }
    });
}

// ================================================================
// 3. 筛选逻辑
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
// 4. 分页
// ================================================================

export function getTotalPages() {
    return 1;
}

export function getCurrentPageDevices() {
    return filteredDevices;
}

export function goToPage(page) {
    return;
}

// ================================================================
// 5. 渲染函数
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
    const isAdmin = isAdminSync();
    const userRegionName = getUserRegionName();

    if (devices.length === 0) {
        const emptyMsg = isAdmin 
            ? '暂无设备，请添加设备或调整筛选条件'
            : `当前区域（${userRegionName}）暂无设备`;
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p class="empty-text">暂无设备</p>
                <p class="empty-hint">${emptyMsg}</p>
            </div>
        `;
        return;
    }

    // 检查是否有搜索关键词
    const hasSearch = searchKeyword && searchKeyword.trim() !== '';

    if (hasSearch) {
        // ============================================================
        // 搜索模式：扁平列表，不分组
        // ============================================================
        let html = `
            <div style="padding:8px 4px 16px 4px;font-size:14px;color:#94a3b8;">
                找到 ${devices.length} 台设备
            </div>
            <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));">
        `;

        devices.forEach(device => {
            html += renderDeviceCard(device, isAdmin);
        });

        html += `</div>`;
        grid.innerHTML = html;

        // 绑定事件
        bindDeviceEvents(grid);
        return;
    }

    // ============================================================
    // 正常模式：按类型分组
    // ============================================================
    const grouped = {};
    devices.forEach(device => {
        const type = device.type || '未分类';
        if (!grouped[type]) {
            grouped[type] = [];
        }
        grouped[type].push(device);
    });

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
                    <span class="type-group-name" id="${groupId}-arrow">▶ ${escapeHtml(type)}</span>
                    <span class="type-group-stats">
                        <span class="type-group-count">共 ${total} 台</span>
                        <span class="type-group-running">● ${running} 台开机</span>
                        <span class="type-group-stopped">○ ${stopped} 台停机</span>
                    </span>
                </div>
                <div class="type-group-grid" id="${groupId}-content" style="display:none;">
        `;

        typeDevices.forEach(device => {
            html += renderDeviceCard(device, isAdmin);
        });

        html += `
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;

    // 绑定事件
    bindDeviceEvents(grid);
}

/**
 * 渲染单张设备卡片
 */
function renderDeviceCard(device, isAdmin) {
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

    // 区域标签：管理员显示所有设备的区域，普通用户不显示（都是自己区域的）
    const showRegion = isAdmin && device.region_name;
    const regionTag = showRegion 
        ? `<span class="device-region" style="font-size:11px;color:#64748b;background:#f1f4f9;padding:1px 8px;border-radius:10px;">${escapeHtml(device.region_name)}</span>`
        : '';

    return `
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
                ${regionTag}
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
}

/**
 * 绑定设备卡片事件
 */
function bindDeviceEvents(grid) {
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

    // 获取当前区域显示名称
    const regionName = getUserRegionName();
    const isAdmin = isAdminSync();

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
        const regionName = getUserRegionName();
        const isAdmin = isAdminSync();
        
        // 普通用户显示区域信息
        const regionInfo = isAdmin ? '' : ` 📍 ${regionName}`;
        el.textContent = filtered === total 
            ? `共 ${total} 台${regionInfo}` 
            : `共 ${filtered} / ${total} 台${regionInfo}`;
    }
}

// ================================================================
// 6. 辅助函数
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
// 7. 操作处理（开机/停机）
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
// 8. 设备状态更新（只更新单张卡片，不重新渲染全部）
// ================================================================

export function updateDeviceLocal(deviceId, updates) {
    const device = allDevices.find(d => d.id === deviceId);
    if (!device) return;

    Object.assign(device, updates);
    updateStatsBarOnly();

    const card = document.querySelector(`.device-card[data-id="${deviceId}"]`);
    if (card) {
        const isRunning = device.status === 1;
        const statusDot = card.querySelector('.status-dot');
        const statusText = card.querySelector('.device-status');
        const durationEl = card.querySelector('.device-duration');
        const actionBtn = card.querySelector('.card-actions .btn-start, .card-actions .btn-stop');

        if (statusDot) {
            statusDot.className = `status-dot ${isRunning ? 'running' : 'stopped'}`;
        }

        if (statusText) {
            statusText.innerHTML = `
                <span class="status-dot ${isRunning ? 'running' : 'stopped'}"></span>
                ${isRunning ? '运行中' : '已停机'}
            `;
        }

        if (durationEl) {
            const currentDuration = isRunning && device.current_start_time
                ? formatDuration(Math.floor(Date.now() / 1000) - device.current_start_time)
                : '--';
            const monthlyHours = device.monthly_hours || 0;
            const monthlyText = monthlyHours > 0 ? `${monthlyHours}小时` : '0小时';
            durationEl.innerHTML = `
                <span>本月运行: ${monthlyText}</span>
                <span>本次运行: ${currentDuration}</span>
            `;
        }

        if (actionBtn) {
            const newBtn = isRunning
                ? `<button class="btn btn-stop" data-id="${device.id}" data-action="stop">停 机</button>`
                : `<button class="btn btn-start" data-id="${device.id}" data-action="start">开 机</button>`;
            actionBtn.outerHTML = newBtn;
            const newActionBtn = card.querySelector('.card-actions .btn-start, .card-actions .btn-stop');
            if (newActionBtn) {
                newActionBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(newActionBtn.dataset.id);
                    const action = newActionBtn.dataset.action;
                    if (action === 'start') {
                        handleStart(id);
                    } else if (action === 'stop') {
                        handleStop(id);
                    }
                });
            }
        }

        card.className = `device-card ${isRunning ? 'running' : 'stopped'}`;
    }

    if (onDeviceChange) {
        onDeviceChange();
    }
}

function updateStatsBarOnly() {
    const devices = window.__devices || [];
    const running = devices.filter(d => d.status === 1 && !d.is_deleted).length;
    const runningCountEl = document.getElementById('runningCount');
    if (runningCountEl) {
        runningCountEl.textContent = `${running} 台`;
    }
}

export function onDeviceChangeCallback(callback) {
    onDeviceChange = callback;
}

// ================================================================
// 9. 获取当前区域ID（用于其他模块）
// ================================================================

export function getCurrentRegionId() {
    return currentRegionId;
}

// ================================================================
// 10. 导出
// ================================================================

export {
    allDevices,
    filteredDevices,
    currentType,
    currentPage,
    pageSize,
    searchKeyword,
    typeList,
    currentRegionId,
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
    setRegionFilter,
    getCurrentRegionId,
    allDevices,
    filteredDevices,
    currentType,
    currentPage,
    searchKeyword,
    typeList,
    currentRegionId,
};
