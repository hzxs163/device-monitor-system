/**
 * ================================================================
 * 设备运行监控系统 - 统一响应格式
 * 功能：标准化 API 响应
 * ================================================================
 */

// ================================================================
// 响应工具
// ================================================================

/**
 * 成功响应
 * @param {any} data - 返回数据
 * @param {string} message - 提示信息
 * @param {number} status - HTTP 状态码
 * @returns {Response}
 */
export function success(data, message = '操作成功', status = 200) {
    return new Response(
        JSON.stringify({
            success: true,
            message,
            data,
        }),
        {
            status,
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );
}

/**
 * 错误响应
 * @param {string} message - 错误信息
 * @param {number} status - HTTP 状态码（默认 400）
 * @param {any} data - 附加数据
 * @returns {Response}
 */
export function error(message = '操作失败', status = 400, data = null) {
    return new Response(
        JSON.stringify({
            success: false,
            error: message,
            data,
        }),
        {
            status,
            headers: {
                'Content-Type': 'application/json',
            },
        }
    );
}

/**
 * 未授权响应（401）
 * @param {string} message - 错误信息
 * @returns {Response}
 */
export function unauthorized(message = '请先登录') {
    return error(message, 401);
}

/**
 * 权限不足响应（403）
 * @param {string} message - 错误信息
 * @returns {Response}
 */
export function forbidden(message = '权限不足') {
    return error(message, 403);
}

/**
 * 参数校验失败响应（422）
 * @param {string} message - 错误信息
 * @returns {Response}
 */
export function validationError(message = '参数校验失败') {
    return error(message, 422);
}

/**
 * 资源不存在响应（404）
 * @param {string} message - 错误信息
 * @returns {Response}
 */
export function notFound(message = '资源不存在') {
    return error(message, 404);
}

/**
 * 服务器错误响应（500）
 * @param {string} message - 错误信息
 * @returns {Response}
 */
export function serverError(message = '服务器内部错误') {
    return error(message, 500);
}

// ================================================================
// 便捷 JSON 解析
// ================================================================

/**
 * 解析请求 JSON 数据，失败返回 null
 * @param {Request} request - Fetch Request 对象
 * @returns {Promise<any|null>}
 */
export async function parseJSON(request) {
    try {
        return await request.json();
    } catch (_) {
        return null;
    }
}

// ================================================================
// 导出
// ================================================================

export default {
    success,
    error,
    unauthorized,
    forbidden,
    validationError,
    notFound,
    serverError,
    parseJSON,
};
