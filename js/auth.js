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

/**
 * 用户登录
 * @param {string} username - 用户名（仅限字母、数字、下划线）
 * @param {string} password - 密码
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function login(username, password) {
    // 用户名格式校验
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
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // 自动携带 cookie
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

        // 登录成功，缓存用户信息
        if (result.data && result.data.user) {
            currentUserCache = result.data.user;
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

/**
 * 用户登出
 * @returns {Promise<{success: boolean}>}
 */
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

    return { success: true };
}

// ================================================================
// 3. 获取当前用户信息
// ================================================================

/**
 * 获取当前登录用户信息
 * @param {boolean} force - 是否强制刷新（忽略缓存）
 * @returns {Promise<object|null>} 用户对象或 null（未登录）
 */
export async function getCurrentUser(force = false) {
    // 如果有缓存且不强制刷新，直接返回
    if (currentUserCache && !force) {
        return currentUserCache;
    }

    // 防止并发重复请求
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
                    // 未登录或 token 过期
                    currentUserCache = null;
                    return null;
                }
                console.warn('[Auth] 获取用户信息失败:', response.status);
                return null;
            }

            const result = await response.json();

            if (result.success && result.data) {
                currentUserCache = result.data;
                return currentUserCache;
            }

            currentUserCache = null;
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

/**
 * 检查登录状态，未登录则跳转登录页
 * @param {string} redirectUrl - 未登录时跳转地址
 * @returns {Promise<object|null>} 用户对象或 null
 */
export async function checkAuth(redirectUrl = '/login.html') {
    const user = await getCurrentUser();

    if (!user) {
        // 未登录，跳转登录页
        if (window.location.pathname !== redirectUrl) {
            window.location.href = redirectUrl;
        }
        return null;
    }

    // 已登录，检查是否在登录页（如果在则跳回首页）
    if (window.location.pathname === '/login.html') {
        window.location.href = '/index.html';
        return null;
    }

    return user;
}

// ================================================================
// 5. 工具函数
// ================================================================

/**
 * 判断当前用户是否为管理员
 * @returns {Promise<boolean>}
 */
export async function isAdmin() {
    const user = await getCurrentUser();
    return user && user.role === 'admin';
}

/**
 * 判断当前用户是否已登录
 * @returns {Promise<boolean>}
 */
export async function isLoggedIn() {
    const user = await getCurrentUser();
    return user !== null;
}

/**
 * 清除用户缓存（用于用户信息变更后刷新）
 */
export function clearUserCache() {
    currentUserCache = null;
    currentUserPromise = null;
}

/**
 * 刷新当前用户信息
 * @returns {Promise<object|null>}
 */
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
