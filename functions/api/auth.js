/**
 * ================================================================
 * 设备运行监控系统 - 认证 API（错误捕获版）
 * ================================================================
 */

import { signJWT } from '../utils/jwt.js';
import { verifyPassword } from '../utils/password.js';
import { success, error, unauthorized, parseJSON } from '../utils/response.js';

// ================================================================
// 辅助函数
// ================================================================

async function getUserByUsername(username, env) {
    try {
        const stmt = env.DB.prepare(`
            SELECT id, username, nickname, password_hash, password_salt, role, is_active
            FROM users
            WHERE username = ?
        `);
        const result = await stmt.bind(username).first();
        return result || null;
    } catch (err) {
        console.error('[Auth] 查询用户失败:', err);
        throw new Error('数据库查询失败: ' + err.message);
    }
}

// ================================================================
// 登录处理
// ================================================================

async function handleLogin(request, env) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { username, password } = body;

    if (!username || !password) {
        return error('用户名和密码不能为空', 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return error('用户名格式不合法', 400);
    }

    const user = await getUserByUsername(username, env);
    if (!user) {
        return error('用户名或密码错误', 401);
    }

    if (user.is_active === 0) {
        return error('账号已被禁用', 403);
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

    // 去掉 Secure 属性
    const cookie = `token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 7}`;

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
// 统一入口 - 全部用 try-catch 包裹
// ================================================================

export async function onRequest(context) {
    const { request, env, user } = context;
    const url = new URL(request.url);
    const method = request.method;

    // OPTIONS 预检
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

    try {
        if (method === 'POST') {
            return await handleLogin(request, env);
        }
        if (method === 'GET') {
            return handleMe(context);
        }
        return error('方法不允许', 405);
    } catch (err) {
        // 捕获所有未预期的错误，返回给前端
        console.error('[Auth] 未捕获异常:', err);
        return new Response(
            JSON.stringify({
                success: false,
                error: err.message || '服务器内部错误',
                stack: err.stack,
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
}
