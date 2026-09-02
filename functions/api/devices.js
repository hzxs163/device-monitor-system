/**
 * ================================================================
 * 设备运行监控系统 - 设备管理 API
 * 功能：设备列表、添加、编辑、删除
 * ================================================================
 */

import { success, error, parseJSON } from '../utils/response.js';

// ================================================================
// 1. GET /api/devices - 获取设备列表
// ================================================================

export async function onRequestGet({ env }) {
    try {
        // 查询所有未删除的设备
        const stmt = env.DB.prepare(`
            SELECT
                d.id,
                d.name,
                d.tag,
                d.type_id,
                dt.name as type,
                d.location,
                d.status,
                d.current_start_time,
                d.is_deleted,
                d.created_at
            FROM devices d
            LEFT JOIN device_types dt ON d.type_id = dt.id
            WHERE d.is_deleted = 0
            ORDER BY d.status DESC, d.id ASC
        `);
        const devices = await stmt.all();

        // 查询所有类型
        const typeStmt = env.DB.prepare(`
            SELECT id, name, sort_order
            FROM device_types
            ORDER BY sort_order ASC, id ASC
        `);
        const types = await typeStmt.all();

        return success({
            devices: devices.results || [],
            types: types.results || [],
        });
    } catch (err) {
        console.error('[Devices] 查询失败:', err);
        return error('查询设备列表失败', 500);
    }
}

// ================================================================
// 2. POST /api/devices - 添加设备
// ================================================================

export async function onRequestPost({ request, env }) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { name, tag, type, location } = body;

    // 参数校验
    if (!name || name.trim() === '') {
        return error('设备名称不能为空', 400);
    }
    if (!tag || tag.trim() === '') {
        return error('位号不能为空', 400);
    }
    if (!type || type.trim() === '') {
        return error('设备类型不能为空', 400);
    }

    try {
        // 检查位号是否已存在
        const checkStmt = env.DB.prepare(`
            SELECT id FROM devices WHERE tag = ? AND is_deleted = 0
        `);
        const existing = await checkStmt.bind(tag.trim()).first();
        if (existing) {
            return error('位号已存在', 400);
        }

        // 获取或创建类型
        const typeId = await getOrCreateType(type.trim(), env);

        // 插入设备
        const insertStmt = env.DB.prepare(`
            INSERT INTO devices (name, tag, type_id, location)
            VALUES (?, ?, ?, ?)
        `);
        const result = await insertStmt
            .bind(name.trim(), tag.trim(), typeId, location?.trim() || null)
            .run();

        return success({
            id: result.meta?.last_row_id || null,
            name: name.trim(),
            tag: tag.trim(),
            type: type.trim(),
            location: location?.trim() || null,
        }, '设备添加成功');
    } catch (err) {
        console.error('[Devices] 添加失败:', err);
        return error('添加设备失败', 500);
    }
}

// ================================================================
// 3. PUT /api/devices/:id - 编辑设备
// ================================================================

export async function onRequestPut({ request, env, params }) {
    // 从 params 获取 deviceId
    let deviceId = parseInt(params?.id);
    
    // 如果 params.id 取不到，从 URL 路径中解析
    if (!deviceId || isNaN(deviceId)) {
        const url = new URL(request.url);
        const pathParts = url.pathname.split('/');
        const lastPart = pathParts[pathParts.length - 1];
        deviceId = parseInt(lastPart);
    }

    if (!deviceId || isNaN(deviceId)) {
        return error('无效的设备 ID', 400);
    }

    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { name, tag, type, location } = body;

    // 参数校验
    if (!name || name.trim() === '') {
        return error('设备名称不能为空', 400);
    }
    if (!tag || tag.trim() === '') {
        return error('位号不能为空', 400);
    }
    if (!type || type.trim() === '') {
        return error('设备类型不能为空', 400);
    }

    try {
        // 检查设备是否存在
        const checkStmt = env.DB.prepare(`
            SELECT id FROM devices WHERE id = ? AND is_deleted = 0
        `);
        const existing = await checkStmt.bind(deviceId).first();
        if (!existing) {
            return error('设备不存在', 404);
        }

        // 检查位号是否被其他设备占用
        const tagCheckStmt = env.DB.prepare(`
            SELECT id FROM devices WHERE tag = ? AND id != ? AND is_deleted = 0
        `);
        const tagExists = await tagCheckStmt.bind(tag.trim(), deviceId).first();
        if (tagExists) {
            return error('位号已被其他设备使用', 400);
        }

        // 获取或创建类型
        const typeId = await getOrCreateType(type.trim(), env);

        // 更新设备
        const updateStmt = env.DB.prepare(`
            UPDATE devices
            SET name = ?, tag = ?, type_id = ?, location = ?
            WHERE id = ?
        `);
        await updateStmt
            .bind(name.trim(), tag.trim(), typeId, location?.trim() || null, deviceId)
            .run();


        return success({ id: deviceId }, '设备更新成功');
    } catch (err) {
        console.error('[Devices] 更新失败:', err);
        return error('更新设备失败: ' + err.message, 500);
    }
}
// ================================================================
// 4. DELETE /api/devices/:id - 删除设备（软删除）
// ================================================================

export async function onRequestDelete({ env, params }) {
    const deviceId = parseInt(params.id);
    if (!deviceId || isNaN(deviceId)) {
        return error('无效的设备 ID', 400);
    }

    try {
        // 检查设备是否存在
        const checkStmt = env.DB.prepare(`
            SELECT id FROM devices WHERE id = ? AND is_deleted = 0
        `);
        const existing = await checkStmt.bind(deviceId).first();
        if (!existing) {
            return error('设备不存在', 404);
        }

        // 软删除
        const deleteStmt = env.DB.prepare(`
            UPDATE devices SET is_deleted = 1, updated_at = unixepoch() WHERE id = ?
        `);
        await deleteStmt.bind(deviceId).run();

        return success({ id: deviceId }, '设备已删除');
    } catch (err) {
        console.error('[Devices] 删除失败:', err);
        return error('删除设备失败', 500);
    }
}

// ================================================================
// 5. 路由分发
// ================================================================

export async function onRequest(context) {
    const { request } = context;
    const method = request.method;

    switch (method) {
        case 'GET':
            return onRequestGet(context);
        case 'POST':
            return onRequestPost(context);
        case 'PUT':
            return onRequestPut(context);
        case 'DELETE':
            return onRequestDelete(context);
        default:
            return error('方法不允许', 405);
    }
}

// ================================================================
// 辅助函数
// ================================================================

/**
 * 获取或创建设备类型
 * @param {string} typeName - 类型名称
 * @param {object} env - 环境变量
 * @returns {Promise<number>} 类型 ID
 */
async function getOrCreateType(typeName, env) {
    // 查询是否存在
    const selectStmt = env.DB.prepare(`
        SELECT id FROM device_types WHERE name = ?
    `);
    const existing = await selectStmt.bind(typeName).first();

    if (existing) {
        return existing.id;
    }

    // 不存在则创建
    const insertStmt = env.DB.prepare(`
        INSERT INTO device_types (name) VALUES (?)
    `);
    const result = await insertStmt.bind(typeName).run();

    // 获取插入的 ID（D1 返回 meta.last_row_id）
    const id = result.meta?.last_row_id || null;
    if (!id) {
        // 如果获取失败，重新查询
        const reSelect = await selectStmt.bind(typeName).first();
        return reSelect?.id || 0;
    }
    return id;
}
