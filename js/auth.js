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
                    return null;
                }
                console.warn('[Auth] 获取用户信息失败:', response.status);
                return null;
            }

            const result = await response.json();

            if (result.success && result.data) {
                currentUserCache = result.data;
                localStorage.setItem('user', JSON.stringify(result.data));
                return currentUserCache;
            }

            currentUserCache = null;
            localStorage.removeItem('user');
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
// 5. 工具函数
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
    checkAuth,
    isAdmin,
    isLoggedIn,
    clearUserCache,
    refreshUser,
};
