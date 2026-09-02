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
        // ============================================================
        // 新增：先从 localStorage 恢复用户信息
        // ============================================================
        const savedUser = localStorage.getItem('user');
        let user = null;

        if (savedUser) {
            try {
                user = JSON.parse(savedUser);
                window.__currentUser = user;
                // 直接渲染用户信息
                renderUserInfo(user);
                // 显示管理员按钮
                if (user.role === 'admin') {
                    const adminBtn = document.getElementById('adminEntryBtn');
                    if (adminBtn) adminBtn.style.display = 'inline-block';
                }
                console.log('[App] 从 localStorage 恢复用户:', user.username);
            } catch (e) {
                console.warn('[App] 解析用户信息失败:', e);
                localStorage.removeItem('user');
                user = null;
            }
        }

        // ============================================================
        // 检查登录状态（验证 Cookie 是否有效）
        // ============================================================
        const authUser = await checkAuth('/login.html');
        
        if (!authUser) {
            // Cookie 验证失败，但 localStorage 有用户信息
            if (savedUser) {
                // 清除本地用户，跳转登录
                localStorage.removeItem('user');
                window.location.href = '/login.html';
                return;
            }
            // checkAuth 会自动跳转
            return;
        }

        // 用 authUser 更新用户信息（确保最新）
        user = authUser;
        window.__currentUser = user;
        localStorage.setItem('user', JSON.stringify(user));
        renderUserInfo(user);

        // 管理员入口控制
        const adminBtn = document.getElementById('adminEntryBtn');
        if (adminBtn) {
            adminBtn.style.display = user.role === 'admin' ? 'inline-block' : 'none';
        }

        // ============================================================
        // 正常初始化流程
        // ============================================================

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

        // 9. 绑定全局事件
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
        // 清除旧样式重新添加
        roleEl.classList.remove('admin');
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
            localStorage.removeItem('user');
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
            import('./statistics.js').then(module => {
                module.exportReport();
            }).catch(err => {
                console.error('[App] 导出失败:', err);
                showToast('导出功能加载失败', 'error');
            });
        });
    }

    // 搜索防抖
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let timer;
        searchInput.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                import('./devices.js').then(module => {
                    module.filterDevices(searchInput.value);
                }).catch(err => {
                    console.error('[App] 搜索失败:', err);
                });
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
