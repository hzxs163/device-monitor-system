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
// 辅助函数：根据用户名查询用户
// ================================================================

async function getUserByUsername(username, env) {
    try {
        const stmt = env.DB.prepare(`
            SELECT id, username, nickname, password_hash, password_salt, role, is_active
            FROM users
            WHERE username = ?
        `);
        const result = await stmt.bind(username).first();

        if (!result) {
            const stmtAll = env.DB.prepare(`
                SELECT id, username, nickname, password_hash, password_salt, role, is_active
                FROM users
                WHERE username = ?
            `);
            const allResult = await stmtAll.bind(username).first();
            if (allResult && allResult.is_active === 0) {
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

// ================================================================
// 处理函数
// ================================================================

async function handleLogin(request, env) {
    console.log('[Auth] 登录请求收到');

    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { username, password } = body;

    if (!username || !password) {
        return error('用户名和密码不能为空', 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return error('用户名格式不合法（仅限字母、数字、下划线）', 400);
    }

    const user = await getUserByUsername(username, env);
    if (!user) {
        return error('用户名或密码错误', 401);
    }

    if (user.is_active === 0) {
        return error('账号已被禁用，请联系管理员', 403);
    }

    const isValid = await verifyPassword(password, user.password_hash, user.password_salt);
    if (!isValid) {
        return error('用户名或密码错误', 401);
    }

    const token = await signJWT(
        {
            id: user.id,
            username: user.username,
            nickname: user.nickname || user.username,
            role: user.role || 'user',
        },
        env
    );

    const userData = {
        id: user.id,
        username: user.username,
        nickname: user.nickname || user.username,
        role: user.role || 'user',
    };

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

function handleLogout() {
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

function handleMe({ user }) {
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
// 统一入口
// ================================================================

export async function onRequest(context) {
    const { request, env, user } = context;
    const url = new URL(request.url);
    const method = request.method;

    // 处理 OPTIONS 预检请求
    if (method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
                'Access-Control-Max-Age': '86400',
            },
        });
    }

    // POST /api/auth → 登录
    if (method === 'POST') {
        return handleLogin(request, env);
    }

    // GET /api/auth → 获取用户信息
    if (method === 'GET') {
        return handleMe(context);
    }

    return error('方法不允许', 405);
}
