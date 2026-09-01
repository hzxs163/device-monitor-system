/**
 * ================================================================
 * 设备运行监控系统 - 前端工具函数
 * 功能：API 封装、Toast、Modal、Excel 导出、时间格式化
 * ================================================================
 */

// ================================================================
// 1. 配置
// ================================================================

// API 基础路径（Pages Functions 路由）
export const API_BASE = '/api';

// 分页默认值
export const DEFAULT_PAGE_SIZE = 8;

// ================================================================
// 2. API 请求封装
// ================================================================

/**
 * 通用 fetch 封装
 * @param {string} url - 接口路径（相对 /api 的路径）
 * @param {object} options - fetch 选项
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
async function request(url, options = {}) {
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
        credentials: 'include', // 携带 cookie（JWT）
    };

    try {
        const response = await fetch(`${API_BASE}${url}`, config);
        const result = await response.json();

        if (!response.ok) {
            // 401 未授权，跳转登录页
            if (response.status === 401) {
                window.location.href = '/login.html';
                return { success: false, error: '登录已过期，请重新登录' };
            }
            return {
                success: false,
                error: result.error || result.message || `请求失败 (${response.status})`,
            };
        }

        return result;
    } catch (error) {
        console.error('API 请求异常:', error);
        return {
            success: false,
            error: error.message || '网络异常，请稍后重试',
        };
    }
}

/**
 * GET 请求
 */
export async function get(url) {
    return request(url, { method: 'GET' });
}

/**
 * POST 请求
 */
export async function post(url, data) {
    return request(url, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

/**
 * PUT 请求
 */
export async function put(url, data) {
    return request(url, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

/**
 * DELETE 请求
 */
export async function del(url) {
    return request(url, { method: 'DELETE' });
}

// ================================================================
// 3. Toast 提示（复用 index.html 中的全局函数）
// ================================================================

/**
 * 显示 Toast 提示
 * @param {string} message - 提示内容
 * @param {string} type - 类型: 'success' | 'error' | 'warning' | 'info'
 */
export function showToast(message, type = 'info') {
    // 优先使用 index.html 中定义的全局 showToast
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }

    // 降级方案：创建临时 toast
    const container = document.getElementById('toastContainer');
    if (!container) {
        console.warn('[Toast] 容器不存在:', message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ================================================================
// 4. 模态框控制（复用 index.html 中的全局函数）
// ================================================================

/**
 * 打开模态框
 * @param {string} html - 模态框内容 HTML
 */
export function openModal(html) {
    if (typeof window.openModal === 'function') {
        window.openModal(html);
        return;
    }
    console.warn('[Modal] openModal 未定义');
}

/**
 * 关闭模态框
 */
export function closeModal() {
    if (typeof window.closeModal === 'function') {
        window.closeModal();
        return;
    }
    console.warn('[Modal] closeModal 未定义');
}

// ================================================================
// 5. 时间格式化工具
// ================================================================

/**
 * 将秒数格式化为 时/分/秒 字符串
 * @param {number} seconds - 秒数
 * @returns {string} 格式化字符串，如 "2小时35分" 或 "45分" 或 "30秒"
 */
export function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '--';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}小时${minutes > 0 ? minutes + '分' : ''}`;
    }
    if (minutes > 0) {
        return `${minutes}分${secs > 0 ? secs + '秒' : ''}`;
    }
    return `${secs}秒`;
}

/**
 * 将秒数格式化为仅小时（取整，≥45分钟进1小时）
 * @param {number} seconds - 秒数
 * @returns {number} 取整后的小时数
 */
export function formatHours(seconds) {
    if (!seconds || seconds < 0) return 0;
    const hours = seconds / 3600;
    // 四舍五入到最接近的整数（≥0.75 进1）
    return Math.round(hours);
}

/**
 * 将时间戳转换为本地日期字符串
 * @param {number} timestamp - Unix 时间戳（秒）
 * @param {string} format - 格式: 'date' | 'datetime' | 'time'
 * @returns {string}
 */
export function formatTimestamp(timestamp, format = 'datetime') {
    if (!timestamp) return '--';
    const date = new Date(timestamp * 1000);

    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const min = pad(date.getMinutes());

    switch (format) {
        case 'date':
            return `${y}-${m}-${d}`;
        case 'time':
            return `${h}:${min}`;
        case 'datetime':
        default:
            return `${y}-${m}-${d} ${h}:${min}`;
    }
}

/**
 * 获取当前月份的第一天和最后一天的时间戳（秒）
 * @param {number} year - 年份
 * @param {number} month - 月份 (1-12)
 * @returns {{ start: number, end: number }}
 */
export function getMonthRange(year, month) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return {
        start: Math.floor(start.getTime() / 1000),
        end: Math.floor(end.getTime() / 1000),
    };
}

/**
 * 获取当前月份名称
 * @param {number} year
 * @param {number} month
 * @returns {string} 如 "2026年9月"
 */
export function getMonthLabel(year, month) {
    return `${year}年${month}月`;
}

// ================================================================
// 6. 防抖/节流
// ================================================================

/**
 * 防抖 - 延迟执行，连续触发时重置计时器
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * 节流 - 固定间隔执行一次
 * @param {Function} fn - 要执行的函数
 * @param {number} interval - 间隔时间（毫秒）
 * @returns {Function}
 */
export function throttle(fn, interval = 500) {
    let lastTime = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastTime >= interval) {
            lastTime = now;
            fn.apply(this, args);
        }
    };
}

// ================================================================
// 7. Excel 导出
// ================================================================

/**
 * 导出 Excel（CSV 格式，可用 Excel/WPS 打开）
 * @param {Array} data - 数据数组，每项是一个对象
 * @param {string} filename - 文件名（不含扩展名）
 * @param {Array} columns - 列配置 [{ key: '字段名', label: '列标题' }]
 */
export function exportToExcel(data, filename, columns) {
    if (!data || data.length === 0) {
        showToast('没有数据可导出', 'warning');
        return;
    }

    // 1. 构建表头
    const headers = columns.map(col => col.label);

    // 2. 构建数据行
    const rows = data.map(item => {
        return columns.map(col => {
            let value = item[col.key];
            // 如果 value 是对象，尝试取 label/name/text
            if (value && typeof value === 'object') {
                value = value.label || value.name || value.text || JSON.stringify(value);
            }
            // 处理 null/undefined
            if (value === null || value === undefined) {
                value = '';
            }
            // 如果包含逗号或换行，包裹引号
            const str = String(value);
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        });
    });

    // 3. 组装 CSV 内容
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    // 4. 添加 BOM 确保 UTF-8 编码
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });

    // 5. 下载
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${filename}_${formatTimestamp(Math.floor(Date.now() / 1000), 'date')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('导出成功', 'success');
}

/**
 * 导出设备运行月报（快捷调用）
 * @param {Array} devices - 设备列表（含本月运行时长）
 * @param {string} monthLabel - 月份标签
 */
export function exportMonthlyReport(devices, monthLabel) {
    const columns = [
        { key: 'rank', label: '排名' },
        { key: 'name', label: '设备名称' },
        { key: 'tag', label: '位号' },
        { key: 'typeName', label: '设备类型' },
        { key: 'hours', label: `${monthLabel}运行时长(小时)` },
        { key: 'statusText', label: '当前状态' },
    ];

    const data = devices.map((d, index) => ({
        rank: index + 1,
        name: d.name,
        tag: d.tag,
        typeName: d.typeName || d.type || '-',
        hours: d.hours || 0,
        statusText: d.status === 1 ? '运行中' : '已停机',
    }));

    exportToExcel(data, `设备月报_${monthLabel}`, columns);
}

// ================================================================
// 8. 通用工具
// ================================================================

/**
 * 生成随机 ID（用于临时元素）
 */
export function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * 判断是否为管理员
 */
export function isAdmin(user) {
    return user && user.role === 'admin';
}

/**
 * 获取元素安全（带防错）
 */
export function $(selector, context = document) {
    return context.querySelector(selector);
}

export function $$(selector, context = document) {
    return context.querySelectorAll(selector);
}

// ================================================================
// 导出所有工具
// ================================================================
export default {
    API_BASE,
    DEFAULT_PAGE_SIZE,
    get,
    post,
    put,
    del,
    showToast,
    openModal,
    closeModal,
    formatDuration,
    formatHours,
    formatTimestamp,
    getMonthRange,
    getMonthLabel,
    debounce,
    throttle,
    exportToExcel,
    exportMonthlyReport,
    genId,
    isAdmin,
    $,
    $$,
};
