/**
 * ================================================================
 * 设备运行监控系统 - 认证 API
 * 功能：登录、登出、获取用户信息
 * ================================================================
 */

import { signJWT } from '../utils/jwt.js';
import { verifyPassword } from '../utils/password.js';
import { success, error, unauthorized, parseJSON } from '../utils/response.js';

// ================================================================
// 1. POST /api/auth/login - 登录
// ================================================================

export async function onRequestPost({ request, env }) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { username, password } = body;

    // 参数校验
    if (!username || !password) {
        return error('用户名和密码不能为空', 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return error('用户名格式不合法（仅限字母、数字、下划线）', 400);
    }

    // 查询用户
    const user = await getUserByUsername(username, env);
    if (!user) {
        return error('用户名或密码错误', 401);
    }

    // 检查用户是否被禁用
    if (user.is_active === 0) {
        return error('账号已被禁用，请联系管理员', 403);
    }

    // 验证密码
    const isValid = await verifyPassword(password, user.password_hash, user.password_salt);
    if (!isValid) {
        return error('用户名或密码错误', 401);
    }

    // 签发 JWT
    const token = await signJWT(
        {
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username,
            role: user.role || 'user',
        },
        env
    );

    // 返回用户信息 + 设置 cookie
    const userData = {
        id: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        role: user.role || 'user',
    };

    // 设置 HttpOnly cookie（安全，前端无法通过 JS 读取）
    const cookie = `token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 7}`;

    return new Response(
        JSON.stringify({
            success: true,
            message: '登录成功',
            data: { user: userData },
        }),
        {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': cookie,
            },
        }
    );
}

// ================================================================
// 2. POST /api/auth/logout - 登出
// ================================================================

export async function onRequestPostLogout() {
    // 清除 cookie（设置过期时间为过去）
    const cookie = 'token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';

    return new Response(
        JSON.stringify({
            success: true,
            message: '已登出',
        }),
        {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': cookie,
            },
        }
    );
}

// ================================================================
// 3. GET /api/auth/me - 获取当前用户信息
// ================================================================

export async function onRequestGetMe({ user }) {
    if (!user) {
        return unauthorized('请先登录');
    }

    return success({
        id: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        role: user.role || 'user',
    }, '获取用户信息成功');
}

// ================================================================
// 路由分发（Pages Functions 根据请求方法自动匹配）
// ================================================================

/**
 * POST 请求路由分发
 */
export async function onRequestPost(context) {
    const { request } = context;
    const url = new URL(request.url);

    // /api/auth/logout
    if (url.pathname === '/api/auth/logout') {
        return onRequestPostLogout();
    }

    // /api/auth/login (默认)
    return onRequestPost(context);
}

/**
 * GET 请求路由分发
 */
export async function onRequestGet(context) {
    const { request } = context;
    const url = new URL(request.url);

    // /api/auth/me
    if (url.pathname === '/api/auth/me') {
        return onRequestGetMe(context);
    }

    return error('接口不存在', 404);
}

// ================================================================
// 辅助函数
// ================================================================

/**
 * 根据用户名查询用户
 */
async function getUserByUsername(username, env) {
    try {
        const stmt = env.DB.prepare(`
            SELECT id, username, nickname, password_hash, password_salt, role, is_active
            FROM users
            WHERE username = ? AND is_active = 1
        `);
        const result = await stmt.bind(username).first();

        if (!result) {
            // 再查一次不限制 is_active，用于判断账号是否被禁用
            const stmtAll = env.DB.prepare(`
                SELECT id, username, nickname, password_hash, password_salt, role, is_active
                FROM users
                WHERE username = ?
            `);
            const allResult = await stmtAll.bind(username).first();
            if (allResult && allResult.is_active === 0) {
                // 账号被禁用，返回特殊标记
                return { ...allResult, is_active: 0 };
            }
            return null;
        }

        return result;
    } catch (error) {
        console.error('[Auth] 查询用户失败:', error);
        return null;
    }
}
