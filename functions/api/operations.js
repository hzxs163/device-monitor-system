/**
 * ================================================================
 * 设备运行监控系统 - 操作日志 API
 * 功能：查询用户操作记录
 * ================================================================
 */

import { success, error } from '../utils/response.js';

// GET /api/operations - 获取操作日志
export async function onRequestGet({ request, env, user }) {
    // 临时去掉权限检查
    // if (!user) {
    //     return error('请先登录', 401);
    // }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit')) || 20;

    // 如果没有用户信息，返回空数据
    if (!user) {
        return success([]);
    }

    try {
        let stmt;
        let params = [];

        // 普通用户：只查自己的记录
        if (user.role !== 'admin') {
            stmt = env.DB.prepare(`
                SELECT id, device_name, device_tag, action, duration_seconds, created_at
                FROM user_operations
                WHERE operator_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            `);
            params = [user.id, limit];
        } else {
            // 管理员：查所有记录
            stmt = env.DB.prepare(`
                SELECT id, device_name, device_tag, operator_name, action, duration_seconds, created_at
                FROM user_operations
                ORDER BY created_at DESC
                LIMIT ?
            `);
            params = [limit];
        }

        const result = await stmt.bind(...params).all();

        // 格式化时间
        const logs = (result.results || []).map(row => ({
            ...row,
            created_at: row.created_at ? formatTime(row.created_at) : '--',
            duration_text: row.duration_seconds ? formatDuration(row.duration_seconds) : null,
        }));

        return success(logs);
    } catch (err) {
        console.error('[Operations] 查询失败:', err);
        return error('查询操作日志失败: ' + err.message, 500);
    }
}

// 路由分发
export async function onRequest(context) {
    const { request } = context;
    const method = request.method;

    if (method === 'GET') {
        return onRequestGet(context);
    }

    return error('方法不允许', 405);
}

// ============================================================
// 辅助函数
// ============================================================

function formatTime(timestamp) {
    const date = new Date(timestamp * 1000);
    date.setHours(date.getHours() + 8);  // ← 加这一行
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0秒';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const parts = [];
    if (hours > 0) parts.push(`${hours}小时`);
    if (minutes > 0) parts.push(`${minutes}分`);
    return parts.join('') || '0分';
}
