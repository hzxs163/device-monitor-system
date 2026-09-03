/**
 * ================================================================
 * 设备运行监控系统 - 用户管理 API
 * 功能：用户列表、添加、编辑、禁用
 * 权限：仅管理员
 * ================================================================
 */

import { generatePasswordHash } from '../utils/password.js';
import { success, error, unauthorized, forbidden, parseJSON } from '../utils/response.js';

// ================================================================
// 1. GET /api/users - 获取用户列表（仅管理员）
// ================================================================

export async function onRequestGet({ env, user }) {
    if (!user) {
        return unauthorized('请先登录');
    }
    if (user.role !== 'admin') {
        return forbidden('需要管理员权限');
    }

    try {
        const stmt = env.DB.prepare(`
            SELECT
                u.id,
                u.username,
                u.nickname,
                u.role,
                u.is_active,
                u.created_at,
                u.created_by,
                u.region_id,
                r.name as region_name
            FROM users u
            LEFT JOIN regions r ON u.region_id = r.id
            ORDER BY u.created_at ASC
        `);
        const result = await stmt.all();

        return success(result.results || []);
    } catch (err) {
        console.error('[Users] 查询失败:', err);
        return error('查询用户列表失败', 500);
    }
}

// ================================================================
// 2. POST /api/users - 添加用户（仅管理员）
// ================================================================

export async function onRequestPost({ request, env, user }) {
    if (!user) {
        return unauthorized('请先登录');
    }
    if (user.role !== 'admin') {
        return forbidden('需要管理员权限');
    }

    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { username, nickname, password, role, region_id } = body;

    // 参数校验
    if (!username || username.trim() === '') {
        return error('用户名不能为空', 400);
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return error('用户名仅限字母、数字、下划线', 400);
    }
    if (!nickname || nickname.trim() === '') {
        return error('昵称不能为空', 400);
    }
    if (!password || password.trim() === '') {
        return error('密码不能为空', 400);
    }

    // 密码长度至少 4 位
    if (password.length < 4) {
        return error('密码长度至少 4 位', 400);
    }

    // 非管理员必须选择区域
    const finalRole = role === 'admin' ? 'admin' : 'user';
    if (finalRole !== 'admin') {
        if (!region_id) {
            return error('普通用户必须选择所属区域', 400);
        }
        // 检查区域是否存在
        const regionCheck = env.DB.prepare(`
            SELECT id FROM regions WHERE id = ?
        `);
        const regionExists = await regionCheck.bind(parseInt(region_id)).first();
        if (!regionExists) {
            return error('所选区域不存在', 400);
        }
    }

    try {
        // 检查用户名是否已存在
        const checkStmt = env.DB.prepare(`
            SELECT id FROM users WHERE username = ?
        `);
        const existing = await checkStmt.bind(username.trim()).first();
        if (existing) {
            return error('用户名已存在', 400);
        }

        // 生成密码哈希
        const { hash, salt } = await generatePasswordHash(password);

        // 生成用户 ID
        const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        // 插入用户（包含 region_id）
        const insertStmt = env.DB.prepare(`
            INSERT INTO users (
                id, username, nickname, password_hash, password_salt,
                role, is_active, created_by, region_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        await insertStmt.bind(
            userId,
            username.trim(),
            nickname.trim(),
            hash,
            salt,
            finalRole,
            1, // 默认启用
            user.id,
            finalRole === 'admin' ? null : parseInt(region_id)
        ).run();

        return success({
            id: userId,
            username: username.trim(),
            nickname: nickname.trim(),
            role: finalRole,
            region_id: finalRole === 'admin' ? null : parseInt(region_id),
        }, '用户添加成功');
    } catch (err) {
        console.error('[Users] 添加失败:', err);
        return error('添加用户失败', 500);
    }
}

// ================================================================
// 3. PUT /api/users/:id - 编辑用户（仅管理员）
// ================================================================

export async function onRequestPut({ request, env, user, params }) {
    if (!user) {
        return unauthorized('请先登录');
    }
    if (user.role !== 'admin') {
        return forbidden('需要管理员权限');
    }

    const userId = params.id;
    if (!userId) {
        return error('用户 ID 不能为空', 400);
    }

    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { nickname, role, password, region_id } = body;

    try {
        // 检查用户是否存在
        const checkStmt = env.DB.prepare(`
            SELECT id, role FROM users WHERE id = ?
        `);
        const existing = await checkStmt.bind(userId).first();
        if (!existing) {
            return error('用户不存在', 404);
        }

        // 构建更新语句
        let updates = [];
        let values = [];

        if (nickname && nickname.trim() !== '') {
            updates.push('nickname = ?');
            values.push(nickname.trim());
        }

        // 处理角色变更
        let finalRole = existing.role;
        if (role && (role === 'admin' || role === 'user')) {
            finalRole = role;
            updates.push('role = ?');
            values.push(finalRole);
        }

        // 处理区域变更
        const isAdmin = finalRole === 'admin';
        if (isAdmin) {
            // 管理员：region_id 设为 NULL
            updates.push('region_id = ?');
            values.push(null);
        } else {
            // 普通用户：必须选择区域
            if (!region_id) {
                return error('普通用户必须选择所属区域', 400);
            }
            // 检查区域是否存在
            const regionCheck = env.DB.prepare(`
                SELECT id FROM regions WHERE id = ?
            `);
            const regionExists = await regionCheck.bind(parseInt(region_id)).first();
            if (!regionExists) {
                return error('所选区域不存在', 400);
            }
            updates.push('region_id = ?');
            values.push(parseInt(region_id));
        }

        if (password && password.trim() !== '') {
            // 重置密码
            if (password.length < 4) {
                return error('密码长度至少 4 位', 400);
            }
            const { hash, salt } = await generatePasswordHash(password);
            updates.push('password_hash = ?, password_salt = ?');
            values.push(hash, salt);
        }

        if (updates.length === 0) {
            return error('没有需要更新的字段', 400);
        }

        // 执行更新
        values.push(userId);
        const updateStmt = env.DB.prepare(`
            UPDATE users SET ${updates.join(', ')} WHERE id = ?
        `);
        await updateStmt.bind(...values).run();

        return success({ id: userId }, '用户更新成功');
    } catch (err) {
        console.error('[Users] 更新失败:', err);
        return error('更新用户失败', 500);
    }
}

// ================================================================
// 4. PUT /api/users/:id/toggle - 启用/禁用用户（仅管理员）
// ================================================================

export async function onRequestPutToggle({ request, env, user, params }) {
    if (!user) {
        return unauthorized('请先登录');
    }
    if (user.role !== 'admin') {
        return forbidden('需要管理员权限');
    }

    const userId = params.id;
    if (!userId) {
        return error('用户 ID 不能为空', 400);
    }

    const body = await parseJSON(request);
    if (!body) {
        return error('无效的请求数据', 400);
    }

    const { is_active } = body;

    // 参数校验
    if (is_active === undefined || is_active === null) {
        return error('is_active 不能为空', 400);
    }
    if (is_active !== 0 && is_active !== 1) {
        return error('is_active 必须为 0 或 1', 400);
    }

    try {
        // 检查用户是否存在
        const checkStmt = env.DB.prepare(`
            SELECT id FROM users WHERE id = ?
        `);
        const existing = await checkStmt.bind(userId).first();
        if (!existing) {
            return error('用户不存在', 404);
        }

        // 不能禁用自己
        if (userId === user.id && is_active === 0) {
            return error('不能禁用自己', 400);
        }

        // 更新状态
        const updateStmt = env.DB.prepare(`
            UPDATE users SET is_active = ? WHERE id = ?
        `);
        await updateStmt.bind(is_active, userId).run();

        const statusText = is_active === 1 ? '启用' : '禁用';
        return success({ id: userId, is_active }, `用户已${statusText}`);
    } catch (err) {
        console.error('[Users] 切换状态失败:', err);
        return error('操作失败', 500);
    }
}

// ================================================================
// 5. 路由分发
// ================================================================

export async function onRequest(context) {
    const { request, params } = context;
    const url = new URL(request.url);
    const method = request.method;

    // /api/users/:id/toggle
    if (url.pathname.match(/^\/api\/users\/[^\/]+\/toggle$/)) {
        if (method === 'PUT') {
            return onRequestPutToggle(context);
        }
        return error('方法不允许', 405);
    }

    // /api/users/:id
    if (params && params.id) {
        if (method === 'PUT') {
            return onRequestPut(context);
        }
        return error('方法不允许', 405);
    }

    // /api/users
    if (method === 'GET') {
        return onRequestGet(context);
    }
    if (method === 'POST') {
        return onRequestPost(context);
    }

    return error('方法不允许', 405);
}
