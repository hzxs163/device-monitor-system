/**
 * ================================================================
 * 设备运行监控系统 - 设备类型管理 API（无权限版本）
 * ================================================================
 */

import { success, error, parseJSON } from '../utils/response.js';

// GET /api/types - 获取类型列表
export async function onRequestGet({ env }) {
    try {
        const stmt = env.DB.prepare(`
            SELECT id, name, sort_order, created_at
            FROM device_types
            ORDER BY sort_order ASC, id ASC
        `);
        const result = await stmt.all();
        return success(result.results || []);
    } catch (err) {
        console.error('[Types] 查询失败:', err);
        return error('查询类型列表失败', 500);
    }
}

// POST /api/types - 添加类型
export async function onRequestPost({ request, env }) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { name } = body;

    if (!name || name.trim() === '') {
        return error('类型名称不能为空', 400);
    }

    try {
        const checkStmt = env.DB.prepare(`
            SELECT id FROM device_types WHERE name = ?
        `);
        const existing = await checkStmt.bind(name.trim()).first();
        if (existing) {
            return error('类型已存在', 400);
        }

        const maxStmt = env.DB.prepare(`
            SELECT MAX(sort_order) as max_order FROM device_types
        `);
        const maxResult = await maxStmt.first();
        const nextOrder = (maxResult?.max_order || 0) + 1;

        const insertStmt = env.DB.prepare(`
            INSERT INTO device_types (name, sort_order) VALUES (?, ?)
        `);
        const result = await insertStmt.bind(name.trim(), nextOrder).run();

        return success({
            id: result.meta?.last_row_id || null,
            name: name.trim(),
            sort_order: nextOrder,
        }, '类型添加成功');
    } catch (err) {
        console.error('[Types] 添加失败:', err);
        return error('添加类型失败', 500);
    }
}

// DELETE /api/types/:id - 删除类型（从 URL 自己解析 ID）
export async function onRequestDelete({ request, env }) {
    // 从 URL 路径中解析 ID
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    const typeId = parseInt(lastPart);

    if (!typeId || isNaN(typeId)) {
        return error('无效的类型 ID', 400);
    }

    try {
        const checkStmt = env.DB.prepare(`
            SELECT id, name FROM device_types WHERE id = ?
        `);
        const existing = await checkStmt.bind(typeId).first();
        if (!existing) {
            return error('类型不存在', 404);
        }

        const deviceCheckStmt = env.DB.prepare(`
            SELECT COUNT(*) as count FROM devices WHERE type_id = ? AND is_deleted = 0
        `);
        const deviceCount = await deviceCheckStmt.bind(typeId).first();

        if (deviceCount && deviceCount.count > 0) {
            return error(`该类型下有 ${deviceCount.count} 台设备正在使用，无法删除`, 400);
        }

        const deleteStmt = env.DB.prepare(`
            DELETE FROM device_types WHERE id = ?
        `);
        await deleteStmt.bind(typeId).run();

        return success({ id: typeId }, `类型已删除`);
    } catch (err) {
        console.error('[Types] 删除失败:', err);
        return error('删除类型失败: ' + err.message, 500);
    }
}

// 路由分发
export async function onRequest(context) {
    const { request } = context;
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;

    // 判断是否是 /api/types/:id 格式
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1];
    const isDetail = lastPart && !isNaN(lastPart);

    if (isDetail) {
        if (method === 'DELETE') {
            return onRequestDelete(context);
        }
        return error('方法不允许', 405);
    }

    if (method === 'GET') {
        return onRequestGet(context);
    }
    if (method === 'POST') {
        return onRequestPost(context);
    }

    return error('方法不允许', 405);
}
