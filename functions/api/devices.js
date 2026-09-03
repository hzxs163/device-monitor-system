/**
 * ================================================================
 * 设备运行监控系统 - 设备管理 API
 * 功能：设备列表、添加、编辑、删除、参数管理
 * ================================================================
 */

import { success, error, parseJSON } from '../utils/response.js';

// ================================================================
// 1. GET /api/devices - 获取设备列表（支持区域过滤）
// ================================================================

export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const regionId = url.searchParams.get('regionId');
        const userId = url.searchParams.get('userId');

        // 构建查询
        let sql = `
            SELECT
                d.id,
                d.name,
                d.tag,
                d.model,
                d.type_id,
                dt.name as type,
                d.location,
                d.status,
                d.current_start_time,
                d.is_deleted,
                d.params,
                d.created_at,
                d.region_id,
                r.name as region_name
            FROM devices d
            LEFT JOIN device_types dt ON d.type_id = dt.id
            LEFT JOIN regions r ON d.region_id = r.id
            WHERE d.is_deleted = 0
        `;
        const bindParams = [];

        // 区域过滤逻辑
        if (userId) {
            // 获取用户信息
            const userStmt = env.DB.prepare(`
                SELECT role, region_id FROM users WHERE id = ?
            `);
            const user = await userStmt.bind(userId).first();

            if (user) {
                if (user.role === 'admin') {
                    // 管理员：如果有 regionId 参数则过滤
                    if (regionId && regionId !== 'all' && regionId !== '') {
                        sql += ` AND d.region_id = ?`;
                        bindParams.push(parseInt(regionId));
                    }
                    // 否则显示全部
                } else {
                    // 普通用户：只能看自己区域的设备
                    sql += ` AND d.region_id = ?`;
                    bindParams.push(user.region_id);
                }
            }
        } else if (regionId && regionId !== 'all' && regionId !== '') {
            // 无 userId 时，按 regionId 过滤（兼容旧逻辑）
            sql += ` AND d.region_id = ?`;
            bindParams.push(parseInt(regionId));
        }

        sql += ` ORDER BY d.status DESC, d.id ASC`;

        const stmt = env.DB.prepare(sql);
        const devices = await stmt.bind(...bindParams).all();

        // 查询所有类型
        const typeStmt = env.DB.prepare(`
            SELECT id, name, sort_order
            FROM device_types
            ORDER BY sort_order ASC, id ASC
        `);
        const types = await typeStmt.all();

        // 查询所有区域（用于前端下拉）
        const regionStmt = env.DB.prepare(`
            SELECT id, name, sort_order
            FROM regions
            ORDER BY sort_order ASC, id ASC
        `);
        const regions = await regionStmt.all();

        return success({
            devices: devices.results || [],
            types: types.results || [],
            regions: regions.results || [],
        });
    } catch (err) {
        console.error('[Devices] 查询失败:', err);
        return error('查询设备列表失败', 500);
    }
}

// ================================================================
// 2. POST /api/devices - 添加设备（支持区域选择）
// ================================================================

export async function onRequestPost({ request, env }) {
    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { name, tag, model, type, location, region_id } = body;

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
    if (!region_id) {
        return error('请选择所属区域', 400);
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

        // 检查区域是否存在
        const regionCheck = env.DB.prepare(`
            SELECT id FROM regions WHERE id = ?
        `);
        const regionExists = await regionCheck.bind(parseInt(region_id)).first();
        if (!regionExists) {
            return error('所选区域不存在', 400);
        }

        // 获取或创建类型
        const typeId = await getOrCreateType(type.trim(), env);

        // 插入设备（包含 region_id）
        const insertStmt = env.DB.prepare(`
            INSERT INTO devices (name, tag, model, type_id, location, region_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const result = await insertStmt
            .bind(
                name.trim(),
                tag.trim(),
                model?.trim() || null,
                typeId,
                location?.trim() || null,
                parseInt(region_id)
            )
            .run();

        return success({
            id: result.meta?.last_row_id || null,
            name: name.trim(),
            tag: tag.trim(),
            model: model?.trim() || null,
            type: type.trim(),
            location: location?.trim() || null,
            region_id: parseInt(region_id),
        }, '设备添加成功');
    } catch (err) {
        console.error('[Devices] 添加失败:', err);
        return error('添加设备失败', 500);
    }
}

// ================================================================
// 3. PUT /api/devices/:id - 编辑设备（支持区域修改）
// ================================================================

export async function onRequestPut({ request, env, params }) {
    let deviceId = parseInt(params?.id);
    
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

    const { name, tag, model, type, location, region_id } = body;

    if (!name || name.trim() === '') {
        return error('设备名称不能为空', 400);
    }
    if (!tag || tag.trim() === '') {
        return error('位号不能为空', 400);
    }
    if (!type || type.trim() === '') {
        return error('设备类型不能为空', 400);
    }
    if (!region_id) {
        return error('请选择所属区域', 400);
    }

    try {
        const checkStmt = env.DB.prepare(`
            SELECT id FROM devices WHERE id = ? AND is_deleted = 0
        `);
        const existing = await checkStmt.bind(deviceId).first();
        if (!existing) {
            return error('设备不存在', 404);
        }

        // 检查区域是否存在
        const regionCheck = env.DB.prepare(`
            SELECT id FROM regions WHERE id = ?
        `);
        const regionExists = await regionCheck.bind(parseInt(region_id)).first();
        if (!regionExists) {
            return error('所选区域不存在', 400);
        }

        const tagCheckStmt = env.DB.prepare(`
            SELECT id FROM devices WHERE tag = ? AND id != ? AND is_deleted = 0
        `);
        const tagExists = await tagCheckStmt.bind(tag.trim(), deviceId).first();
        if (tagExists) {
            return error('位号已被其他设备使用', 400);
        }

        const typeId = await getOrCreateType(type.trim(), env);

        // 更新设备（包含 region_id）
        const updateStmt = env.DB.prepare(`
            UPDATE devices
            SET name = ?, tag = ?, model = ?, type_id = ?, location = ?, region_id = ?
            WHERE id = ?
        `);
        await updateStmt
            .bind(
                name.trim(),
                tag.trim(),
                model?.trim() || null,
                typeId,
                location?.trim() || null,
                parseInt(region_id),
                deviceId
            )
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
        const checkStmt = env.DB.prepare(`
            SELECT id FROM devices WHERE id = ? AND is_deleted = 0
        `);
        const existing = await checkStmt.bind(deviceId).first();
        if (!existing) {
            return error('设备不存在', 404);
        }

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
// 5. PUT /api/devices/:id/params - 更新设备参数
// ================================================================

export async function onRequestPutParams({ request, env, params }) {
    // 从 URL 中解析 deviceId
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const deviceId = parseInt(pathParts[pathParts.length - 2]);

    if (!deviceId || isNaN(deviceId)) {
        return error('无效的设备 ID', 400);
    }

    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { params: paramValues } = body;
    if (!paramValues || typeof paramValues !== 'object') {
        return error('参数数据格式错误', 400);
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

        const updateStmt = env.DB.prepare(`
            UPDATE devices SET params = ?, updated_at = unixepoch() WHERE id = ?
        `);
        await updateStmt.bind(JSON.stringify(paramValues), deviceId).run();

        return success({ message: '参数已更新' });
    } catch (err) {
        console.error('[Devices] 更新参数失败:', err);
        return error('更新设备参数失败: ' + err.message, 500);
    }
}

// ================================================================
// 6. 路由分发
// ================================================================

export async function onRequest(context) {
    const { request } = context;
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;

    // 匹配 /api/devices/:id/params
    if (path.endsWith('/params')) {
        if (method === 'PUT') {
            return onRequestPutParams(context);
        }
        return error('方法不允许', 405);
    }

    // 匹配 /api/devices/:id
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1];
    const isDetail = lastPart && !isNaN(lastPart);

    if (isDetail) {
        if (method === 'PUT') {
            return onRequestPut(context);
        }
        if (method === 'DELETE') {
            return onRequestDelete(context);
        }
        return error('方法不允许', 405);
    }

    // 匹配 /api/devices
    switch (method) {
        case 'GET':
            return onRequestGet(context);
        case 'POST':
            return onRequestPost(context);
        default:
            return error('方法不允许', 405);
    }
}

// ================================================================
// 辅助函数
// ================================================================

async function getOrCreateType(typeName, env) {
    const selectStmt = env.DB.prepare(`
        SELECT id FROM device_types WHERE name = ?
    `);
    const existing = await selectStmt.bind(typeName).first();

    if (existing) {
        return existing.id;
    }

    const insertStmt = env.DB.prepare(`
        INSERT INTO device_types (name) VALUES (?)
    `);
    const result = await insertStmt.bind(typeName).run();

    const id = result.meta?.last_row_id || null;
    if (!id) {
        const reSelect = await selectStmt.bind(typeName).first();
        return reSelect?.id || 0;
    }
    return id;
}
