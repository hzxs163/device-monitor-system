/**
 * ================================================================
 * 设备运行监控系统 - 应用入口
 * 功能：初始化、全局状态、模块协调
 * ================================================================
 */

import { checkAuth, getCurrentUser, logout } from './auth.js';
import { loadDevices, renderAll, renderTypeTabs, onDeviceChangeCallback } from './devices.js';
import { loadStatistics, renderTypeSummary, renderRankTable } from './statistics.js';
import { showToast } from './utils.js';

// ================================================================
// 全局状态
// ================================================================

// 暴露设备列表到全局，供其他模块使用
window.__devices = [];
window.__statTotalHours = 0;
window.__currentUser = null;

// ================================================================
// 应用初始化
// ================================================================

/**
 * 应用主入口
 */
export async function initApp() {
    try {
        // 1. 检查登录状态
        const user = await checkAuth('/login.html');
        if (!user) {
            // checkAuth 会自动跳转
            return;
        }

        // 保存当前用户到全局
        window.__currentUser = user;
        renderUserInfo(user);

        // 2. 设置当前月份
        const now = new Date();
        const monthEl = document.getElementById('currentMonth');
        if (monthEl) {
            monthEl.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月`;
        }

        // 3. 加载设备列表
        await loadDevices(false);
        window.__devices = window.__devices || [];

        // 4. 渲染类型标签
        renderTypeTabs();

        // 5. 渲染设备列表
        renderAll();

        // 6. 加载统计数据
        await loadStatistics();
        renderTypeSummary();
        renderRankTable();

        // 7. 更新统计栏
        updateStatsBar();

        // 8. 注册设备变更回调（开机/停机后触发统计刷新）
        onDeviceChangeCallback(() => {
            refreshStatistics();
        });

        // 9. 管理员入口控制
        const adminBtn = document.getElementById('adminEntryBtn');
        if (adminBtn) {
            if (user.role === 'admin') {
                adminBtn.style.display = 'inline-block';
            } else {
                adminBtn.style.display = 'none';
            }
        }

        // 10. 绑定全局事件
        bindGlobalEvents();

        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('[App] 初始化失败:', error);
        showToast('应用加载失败，请刷新页面重试', 'error');
    }
}

// ================================================================
// 渲染用户信息
// ================================================================

function renderUserInfo(user) {
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');

    if (nameEl) {
        nameEl.textContent = user.nickname || user.username;
    }
    if (roleEl) {
        roleEl.textContent = user.role === 'admin' ? '管理员' : '普通用户';
        if (user.role === 'admin') {
            roleEl.classList.add('admin');
        }
    }
}

// ================================================================
// 更新统计栏
// ================================================================

function updateStatsBar() {
    const totalHoursEl = document.getElementById('totalHours');
    const runningCountEl = document.getElementById('runningCount');

    if (totalHoursEl) {
        const total = window.__statTotalHours || 0;
        totalHoursEl.textContent = `${total} 小时`;
    }

    if (runningCountEl) {
        const devices = window.__devices || [];
        const running = devices.filter(d => d.status === 1 && !d.is_deleted).length;
        runningCountEl.textContent = `${running} 台`;
    }
}

// ================================================================
// 刷新统计数据（设备变更后调用）
// ================================================================

async function refreshStatistics() {
    try {
        await loadStatistics();
        renderTypeSummary();
        renderRankTable();
        updateStatsBar();
    } catch (error) {
        console.warn('[App] 刷新统计失败:', error);
    }
}

// ================================================================
// 绑定全局事件
// ================================================================

function bindGlobalEvents() {
    // 退出登录
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await logout();
            window.location.href = '/login.html';
        });
    }

    // 管理员入口
    const adminBtn = document.getElementById('adminEntryBtn');
    if (adminBtn) {
        adminBtn.addEventListener('click', async () => {
            const { renderAdminPanel } = await import('./admin.js');
            renderAdminPanel();
        });
    }

    // 导出按钮
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const { exportReport } = require('./statistics.js');
            exportReport();
        });
    }

    // 搜索防抖
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let timer;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const { filterDevices } = require('./devices.js');
                filterDevices(searchInput.value);
            }, 300);
        });
    }
}

// ================================================================
// 页面加载完成后启动
// ================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// ================================================================
// 导出
// ================================================================

export default {
    initApp,
    refreshStatistics,
};
