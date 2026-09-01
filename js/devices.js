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

// 所有设备数据
let allDevices = [];

// 当前筛选后的设备列表
let filteredDevices = [];

// 当前类型（'all' 表示全部）
let currentType = 'all';

// 当前搜索关键词
let searchKeyword = '';

// 当前页码
let currentPage = 1;

// 每页数量
export const PAGE_SIZE = DEFAULT_PAGE_SIZE;

// 设备类型列表
let typeList = [];

// 当前选中的设备 ID（用于操作）
let selectedDeviceId = null;

// 回调函数（由 index.html 注册）
let onDeviceChange = null;

// ================================================================
// 1. 加载设备列表
// ================================================================

/**
 * 从服务器加载设备列表
 * @param {boolean} silent - 是否静默加载（不显示 Toast）
 * @returns {Promise<Array>}
 */
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

        allDevices = result.data || [];
        // 同时更新设备类型列表
        typeList = result.types || [];
        // 重新应用筛选
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

/**
 * 重新加载设备（强制刷新）
 */
export async function reloadDevices() {
    return loadDevices(false);
}

// ================================================================
// 2. 筛选逻辑
// ================================================================

/**
 * 应用所有筛选条件
 */
function applyFilters() {
    let list = [...allDevices];

    // 按类型筛选
    if (currentType !== 'all') {
        list = list.filter(d => d.type === currentType);
    }

    // 按关键词搜索（设备名称或位号）
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

    filteredDevices = list;

    // 如果当前页超出范围，回到第一页
    const totalPages = getTotalPages();
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }
}

/**
 * 切换设备类型
 * @param {string} type - 类型名称 或 'all'
 */
export function switchType(type) {
    if (currentType === type) return;
    currentType = type;
    currentPage = 1;
    applyFilters();
    renderAll();
}

/**
 * 搜索设备
 * @param {string} keyword - 搜索关键词
 */
export function filterDevices(keyword) {
    searchKeyword = keyword || '';
    currentPage = 1;
    applyFilters();
    renderAll();
}

// ================================================================
// 3. 分页
// ================================================================

/**
 * 获取总页数
 */
export function getTotalPages() {
    return Math.ceil(filteredDevices.length / PAGE_SIZE) || 1;
}

/**
 * 获取当前页的设备列表
 */
export function getCurrentPageDevices() {
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return filteredDevices.slice(start, end);
}

/**
 * 跳转到指定页
 */
export function goToPage(page) {
    const total = getTotalPages();
    if (page < 1 || page > total) return;
    currentPage = page;
    renderDevices();
    renderPagination();
}

// ================================================================
// 4. 渲染函数
// ================================================================

/**
 * 渲染所有（设备卡片 + 分页 + 计数）
 */
export function renderAll() {
    renderDeviceCount();
    renderDevices();
    renderPagination();
}

/**
 * 渲染设备卡片
 */
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
        const durationText = isRunning && device.current_start_time
            ? formatDuration(Math.floor(Date.now() / 1000) - device.current_start_time)
            : '--';

        // 操作按钮
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
                    <span class="device-duration">
                        ${isRunning ? `本次运行: ${durationText}` : '已停机'}
                    </span>
                </div>
                <div class="card-actions">
                    ${actionBtn}
                </div>
            </div>
        `;
    }).join('');

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

/**
 * 渲染设备类型标签
 */
export function renderTypeTabs() {
    const container = document.getElementById('typeTabs');
    if (!container) return;

    // 从 allDevices 中提取类型
    const types = getAllTypes();

    let html = `
        <button class="type-tab ${currentType === 'all' ? 'active' : ''}" data-type="all">
            全部 <span class="badge">${allDevices.filter(d => !d.is_deleted).length}</span>
        </button>
    `;

    types.forEach(type => {
        const count = allDevices.filter(d => d.type === type && !d.is_deleted).length;
        html += `
            <button class="type-tab ${currentType === type ? 'active' : ''}" data-type="${escapeHtml(type)}">
                ${escapeHtml(type)} <span class="badge">${count}</span>
            </button>
        `;
    });

    container.innerHTML = html;

    // 绑定点击事件
    container.querySelectorAll('.type-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const type = tab.dataset.type;
            switchType(type);
        });
    });
}

/**
 * 渲染分页
 */
export function renderPagination() {
    const container = document.getElementById('pagination');
    if (!container) return;

    const total = getTotalPages();
    const current = currentPage;

    if (total <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';

    // 上一页
    html += `<button class="page-btn" data-page="${current - 1}" ${current <= 1 ? 'disabled' : ''}>◀</button>`;

    // 页码
    const pages = getPageRange(current, total);
    pages.forEach(p => {
        if (p === '...') {
            html += `<span class="page-ellipsis">…</span>`;
        } else {
            html += `<button class="page-btn ${p === current ? 'active' : ''}" data-page="${p}">${p}</button>`;
        }
    });

    // 下一页
    html += `<button class="page-btn" data-page="${current + 1}" ${current >= total ? 'disabled' : ''}>▶</button>`;

    container.innerHTML = html;

    // 绑定点击事件
    container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const page = parseInt(btn.dataset.page);
            if (!isNaN(page) && page >= 1 && page <= total) {
                goToPage(page);
            }
        });
    });
}

/**
 * 渲染设备计数
 */
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

/**
 * 从设备列表中提取所有类型
 */
function getAllTypes() {
    const types = new Set();
    allDevices.forEach(d => {
        if (d.type && !d.is_deleted) {
            types.add(d.type);
        }
    });
    // 按字母排序
    return Array.from(types).sort();
}

/**
 * 获取页码范围
 */
function getPageRange(current, total) {
    const range = [];
    const show = 5; // 最多显示 5 个页码

    if (total <= show) {
        for (let i = 1; i <= total; i++) range.push(i);
        return range;
    }

    // 总是显示第一页
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

    // 总是显示最后一页
    if (total > 1) range.push(total);

    return range;
}

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
// 6. 操作处理（开机/停机）
// ================================================================

/**
 * 处理开机操作
 */
async function handleStart(deviceId) {
    // 导入 operations 模块（避免循环依赖）
    const { startDevice } = await import('./operations.js');
    await startDevice(deviceId);
}

/**
 * 处理停机操作
 */
async function handleStop(deviceId) {
    const { stopDevice } = await import('./operations.js');
    await stopDevice(deviceId);
}

// ================================================================
// 7. 设备状态更新（由 operations.js 调用）
// ================================================================

/**
 * 更新单个设备的状态（本地更新，不重新加载）
 * @param {number} deviceId - 设备 ID
 * @param {object} updates - 更新字段 { status, current_start_time }
 */
export function updateDeviceLocal(deviceId, updates) {
    const device = allDevices.find(d => d.id === deviceId);
    if (device) {
        Object.assign(device, updates);
        // 重新应用筛选并渲染
        applyFilters();
        renderAll();
        // 通知统计模块更新
        if (onDeviceChange) {
            onDeviceChange();
        }
    }
}

/**
 * 注册设备变更回调
 */
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
