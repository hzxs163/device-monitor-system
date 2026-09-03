/**
 * ================================================================
 * 设备运行监控系统 - 前端认证模块
 * 功能：登录、登出、用户状态管理
 * ================================================================
 */

// ================================================================
// 状态缓存
// ================================================================

let currentUserCache = null;
let currentUserPromise = null;

// ================================================================
// 1. 登录
// ================================================================

export async function login(username, password) {
    if (!username || username.trim() === '') {
        return { success: false, error: '请输入用户名' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return { success: false, error: '用户名仅限字母、数字、下划线' };
    }
    if (!password || password.trim() === '') {
        return { success: false, error: '请输入密码' };
    }

    try {
        const response = await fetch('/api/auth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                username: username.trim(),
                password: password.trim(),
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            return {
                success: false,
                error: result.error || result.message || '登录失败',
            };
        }

        if (result.success && result.data && result.data.user) {
            currentUserCache = result.data.user;
            // 保存到 localStorage
            localStorage.setItem('user', JSON.stringify(result.data.user));
            // 额外保存区域信息到独立字段，方便快速读取
            const user = result.data.user;
            localStorage.setItem('region_id', user.region_id || '');
            localStorage.setItem('region_name', user.region_name || '全部区域');
            localStorage.setItem('is_admin', user.is_admin ? 'true' : 'false');
        }

        return {
            success: true,
            data: result.data,
        };
    } catch (error) {
        console.error('[Auth] 登录异常:', error);
        return {
            success: false,
            error: error.message || '网络异常，请稍后重试',
        };
    }
}

// ================================================================
// 2. 登出
// ================================================================

export async function logout() {
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
        });
    } catch (error) {
        console.warn('[Auth] 登出请求失败:', error);
    }

    // 清除缓存
    currentUserCache = null;
    currentUserPromise = null;

    // 清除 localStorage
    localStorage.removeItem('user');
    localStorage.removeItem('region_id');
    localStorage.removeItem('region_name');
    localStorage.removeItem('is_admin');

    return { success: true };
}

// ================================================================
// 3. 获取当前用户信息
// ================================================================

export async function getCurrentUser(force = false) {
    if (currentUserCache && !force) {
        return currentUserCache;
    }

    // 先从 localStorage 读取
    const savedUser = localStorage.getItem('user');
    if (savedUser && !force) {
        try {
            const user = JSON.parse(savedUser);
            currentUserCache = user;
            return user;
        } catch (e) {
            console.warn('[Auth] 解析 localStorage 用户信息失败:', e);
            localStorage.removeItem('user');
        }
    }

    if (currentUserPromise) {
        return currentUserPromise;
    }

    currentUserPromise = (async () => {
        try {
            const response = await fetch('/api/auth/me', {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                if (response.status === 401) {
                    currentUserCache = null;
                    localStorage.removeItem('user');
                    localStorage.removeItem('region_id');
                    localStorage.removeItem('region_name');
                    localStorage.removeItem('is_admin');
                    return null;
                }
                console.warn('[Auth] 获取用户信息失败:', response.status);
                return null;
            }

            const result = await response.json();

            if (result.success && result.data) {
                currentUserCache = result.data;
                localStorage.setItem('user', JSON.stringify(result.data));
                // 保存区域信息到独立字段
                localStorage.setItem('region_id', result.data.region_id || '');
                localStorage.setItem('region_name', result.data.region_name || '全部区域');
                localStorage.setItem('is_admin', result.data.is_admin ? 'true' : 'false');
                return currentUserCache;
            }

            currentUserCache = null;
            localStorage.removeItem('user');
            localStorage.removeItem('region_id');
            localStorage.removeItem('region_name');
            localStorage.removeItem('is_admin');
            return null;
        } catch (error) {
            console.error('[Auth] 获取用户信息异常:', error);
            currentUserCache = null;
            return null;
        } finally {
            currentUserPromise = null;
        }
    })();

    return currentUserPromise;
}

// ================================================================
// 4. 检查登录状态（页面守卫）
// ================================================================

export async function checkAuth(redirectUrl = '/login.html') {
    const user = await getCurrentUser();

    if (!user) {
        if (window.location.pathname !== redirectUrl) {
            window.location.href = redirectUrl;
        }
        return null;
    }

    if (window.location.pathname === '/login.html') {
        window.location.href = '/index.html';
        return null;
    }

    return user;
}

// ================================================================
// 5. 工具函数 - 获取用户区域信息
// ================================================================

/**
 * 获取当前用户的区域ID
 * @returns {number|null} 区域ID，管理员返回 null
 */
export function getUserRegionId() {
    const saved = localStorage.getItem('region_id');
    if (saved && saved !== '') {
        return parseInt(saved);
    }
    // 兜底：从 user 对象读取
    const user = getCurrentUserSync();
    return user?.region_id || null;
}

/**
 * 获取当前用户的区域名称
 * @returns {string} 区域名称，管理员返回 '全部区域'
 */
export function getUserRegionName() {
    const saved = localStorage.getItem('region_name');
    if (saved && saved !== '') {
        return saved;
    }
    // 兜底：从 user 对象读取
    const user = getCurrentUserSync();
    return user?.region_name || '全部区域';
}

/**
 * 判断当前用户是否为管理员
 * @returns {boolean}
 */
export function isAdminSync() {
    const saved = localStorage.getItem('is_admin');
    if (saved !== null) {
        return saved === 'true';
    }
    const user = getCurrentUserSync();
    return user?.role === 'admin';
}

/**
 * 同步获取当前用户信息（从 localStorage）
 * @returns {object|null}
 */
export function getCurrentUserSync() {
    const saved = localStorage.getItem('user');
    if (!saved) return null;
    try {
        return JSON.parse(saved);
    } catch {
        return null;
    }
}

// ================================================================
// 6. 原有工具函数（异步版本）
// ================================================================

export async function isAdmin() {
    const user = await getCurrentUser();
    return user && user.role === 'admin';
}

export async function isLoggedIn() {
    const user = await getCurrentUser();
    return user !== null;
}

export function clearUserCache() {
    currentUserCache = null;
    currentUserPromise = null;
    localStorage.removeItem('user');
    localStorage.removeItem('region_id');
    localStorage.removeItem('region_name');
    localStorage.removeItem('is_admin');
}

export async function refreshUser() {
    clearUserCache();
    return getCurrentUser(true);
}

// ================================================================
// 导出
// ================================================================

export default {
    login,
    logout,
    getCurrentUser,
    getCurrentUserSync,
    getUserRegionId,
    getUserRegionName,
    isAdminSync,
    checkAuth,
    isAdmin,
    isLoggedIn,
    clearUserCache,
    refreshUser,
};
