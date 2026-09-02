/**
 * ================================================================
 * 设备运行监控系统 - Pages Functions 全局中间件
 * 功能：JWT 验证、用户注入
 * ================================================================
 */

import { getUserFromRequest } from './utils/jwt.js';
import { unauthorized, error } from './utils/response.js';

// ================================================================
// 白名单（不需要 JWT 验证的接口）
// ================================================================

const PUBLIC_PATHS = [
    '/api/auth',   // ← 添加这一行，允许 POST /api/auth 登录
];

// ================================================================
// 中间件主函数
// ================================================================

export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // 1. 白名单：跳过验证
    if (PUBLIC_PATHS.includes(path)) {
        return await next();
    }

    // 2. 验证 JWT
    const user = await getUserFromRequest(request, env);

    if (!user) {
        return unauthorized('请先登录');
    }

    // 3. 将用户信息注入 context
    context.user = user;

    // 4. 继续执行后续处理
    return await next();
}
