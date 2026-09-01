/**
 * ================================================================
 * 设备运行监控系统 - JWT 工具
 * 功能：签发、验证、提取 JWT
 * ================================================================
 */

import { SignJWT, jwtVerify } from 'jose';

// ================================================================
// 配置
// ================================================================

// JWT 过期时间：7 天
const EXPIRES_IN = '7d';

// ================================================================
// 1. 获取密钥
// ================================================================

/**
 * 获取 JWT 签名密钥
 * 从环境变量 JWT_SECRET 读取
 */
function getSecretKey(env) {
    const secret = env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET 环境变量未设置');
    }
    // 将字符串转为 Uint8Array
    return new TextEncoder().encode(secret);
}

// ================================================================
// 2. 签发 JWT
// ================================================================

/**
 * 签发 JWT
 * @param {object} payload - 要签入的数据 { id, username, nickname, role }
 * @param {object} env - 环境变量对象
 * @returns {Promise<string>} JWT 字符串
 */
export async function signJWT(payload, env) {
    try {
        const secret = getSecretKey(env);
        const token = await new SignJWT({
            id: payload.id,
            username: payload.username,
            nickname: payload.nickname || payload.username,
            role: payload.role || 'user',
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setIssuedAt()
            .setExpirationTime(EXPIRES_IN)
            .sign(secret);

        return token;
    } catch (error) {
        console.error('[JWT] 签发失败:', error);
        throw new Error('签发 JWT 失败');
    }
}

// ================================================================
// 3. 验证 JWT
// ================================================================

/**
 * 验证 JWT
 * @param {string} token - JWT 字符串
 * @param {object} env - 环境变量对象
 * @returns {Promise<object|null>} 解析后的 payload 或 null
 */
export async function verifyJWT(token, env) {
    try {
        const secret = getSecretKey(env);
        const { payload } = await jwtVerify(token, secret, {
            algorithms: ['HS256'],
        });

        return {
            id: payload.id,
            username: payload.username,
            nickname: payload.nickname || payload.username,
            role: payload.role || 'user',
            iat: payload.iat,
            exp: payload.exp,
        };
    } catch (error) {
        // 不同错误类型
        if (error.code === 'ERR_JWT_EXPIRED') {
            console.warn('[JWT] Token 已过期');
        } else if (error.code === 'ERR_JWT_INVALID') {
            console.warn('[JWT] Token 无效');
        } else {
            console.error('[JWT] 验证失败:', error.message);
        }
        return null;
    }
}

// ================================================================
// 4. 从请求中提取 JWT
// ================================================================

/**
 * 从请求中提取 JWT
 * 优先级：Cookie > Authorization Header
 * @param {Request} request - Fetch Request 对象
 * @returns {string|null} JWT 字符串或 null
 */
export function extractJWT(request) {
    // 1. 从 Cookie 中提取
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {});
        if (cookies.token) {
            return cookies.token;
        }
    }

    // 2. 从 Authorization Header 提取
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    return null;
}

// ================================================================
// 5. 从请求中获取用户信息（验证 + 提取）
// ================================================================

/**
 * 从请求中获取用户信息
 * @param {Request} request - Fetch Request 对象
 * @param {object} env - 环境变量对象
 * @returns {Promise<object|null>} 用户信息或 null
 */
export async function getUserFromRequest(request, env) {
    const token = extractJWT(request);
    if (!token) {
        return null;
    }
    return verifyJWT(token, env);
}

// ================================================================
// 导出
// ================================================================

export default {
    signJWT,
    verifyJWT,
    extractJWT,
    getUserFromRequest,
};
