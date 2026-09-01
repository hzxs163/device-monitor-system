/**
 * ================================================================
 * 设备运行监控系统 - 密码工具
 * 功能：PBKDF2 密码哈希 + 验证
 * 使用 Web Crypto API（Cloudflare Workers 原生支持）
 * ================================================================
 */

// ================================================================
// 配置
// ================================================================

// PBKDF2 配置
const PBKDF2_CONFIG = {
    iterations: 50000,          // 迭代次数
    keyLength: 64,              // 输出长度（字节）
    hashAlgorithm: 'SHA-256',   // 哈希算法
    saltLength: 16,             // 盐长度（字节）
};

// ================================================================
// 1. 工具函数
// ================================================================

/**
 * 将 ArrayBuffer 转为十六进制字符串
 */
function bufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * 将十六进制字符串转为 ArrayBuffer
 */
function hexToBuffer(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes.buffer;
}

/**
 * 生成随机盐（十六进制）
 */
export function generateSalt() {
    const salt = new Uint8Array(PBKDF2_CONFIG.saltLength);
    crypto.getRandomValues(salt);
    return bufferToHex(salt);
}

// ================================================================
// 2. 密码哈希
// ================================================================

/**
 * 使用 PBKDF2 生成密码哈希
 * @param {string} password - 明文密码
 * @param {string} salt - 盐（十六进制）
 * @returns {Promise<string>} 哈希值（十六进制）
 */
export async function hashPassword(password, salt) {
    // 将密码和盐转为 ArrayBuffer
    const passwordBuffer = new TextEncoder().encode(password);
    const saltBuffer = hexToBuffer(salt);

    // 使用 Web Crypto API 进行 PBKDF2 派生
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: PBKDF2_CONFIG.iterations,
            hash: PBKDF2_CONFIG.hashAlgorithm,
        },
        keyMaterial,
        PBKDF2_CONFIG.keyLength * 8 // 位长度
    );

    return bufferToHex(derivedBits);
}

/**
 * 生成完整的密码哈希（自动生成盐）
 * @param {string} password - 明文密码
 * @returns {Promise<{hash: string, salt: string}>}
 */
export async function generatePasswordHash(password) {
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    return { hash, salt };
}

// ================================================================
// 3. 密码验证
// ================================================================

/**
 * 验证密码
 * @param {string} password - 待验证的明文密码
 * @param {string} hash - 存储的密码哈希
 * @param {string} salt - 存储的盐
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, hash, salt) {
    const computedHash = await hashPassword(password, salt);
    return computedHash === hash;
}

// ================================================================
// 4. 密码强度检查（可选）
// ================================================================

/**
 * 检查密码强度
 * @param {string} password - 明文密码
 * @returns {{ valid: boolean, message: string }}
 */
export function checkPasswordStrength(password) {
    if (!password || password.length < 4) {
        return { valid: false, message: '密码长度至少 4 位' };
    }
    return { valid: true, message: '密码强度合格' };
}

// ================================================================
// 导出
// ================================================================

export default {
    generateSalt,
    hashPassword,
    generatePasswordHash,
    verifyPassword,
    checkPasswordStrength,
    PBKDF2_CONFIG,
};
