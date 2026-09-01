/**
 * ================================================================
 * 设备运行监控系统 - Pages Functions 全局中间件
 * 功能：JWT 验证、用户注入
 * 注意：此文件放在 functions/ 根目录，对所有 /api/* 请求生效
 * ================================================================
 */

import { getUserFromRequest } from './utils/jwt.js';
import { unauthorized, error } from './utils/response.js';

// ================================================================
// 白名单（不需要 JWT 验证的接口）
// ================================================================

const PUBLIC_PATHS = [
    '/api/auth/login',   // 登录接口
];

// ================================================================
// 中间件主函数
// ================================================================

/**
 * Pages Functions 中间件
 * 在每个请求处理前执行
 */
export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // 1. 白名单：跳过验证
    if (PUBLIC_PATHS.includes(path)) {
        return await next();
    }

    // 2. 验证 JWT
    const user = await getUserFromRequest(request, env);

    if (!user) {
        return unauthorized('请先登录');
    }

    // 3. 将用户信息注入 context，供后续 API 使用
    context.user = user;

    // 4. 继续执行后续处理
    return await next();
}
