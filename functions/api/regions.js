/**
 * ================================================================
 * 设备运行监控系统 - 区域管理 API..
 * 功能：获取所有区域列表..
 * ================================================================
 */

// 工具函数：成功响应
function success(data, message = '操作成功') {
    return new Response(
        JSON.stringify({ success: true, message, data }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

// 工具函数：错误响应
function error(message = '操作失败', status = 400) {
    return new Response(
        JSON.stringify({ success: false, error: message, data: null }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );
}

// ================================================================
// GET /api/regions - 获取所有区域列表
// ================================================================

export async function onRequestGet({ env }) {
    try {
        const stmt = env.DB.prepare(`
            SELECT id, name, sort_order, created_at
            FROM regions
            ORDER BY sort_order ASC, id ASC
        `);
        const result = await stmt.all();
        
        return success(result.results || []);
    } catch (err) {
        console.error('[Regions] 查询失败:', err);
        return error('获取区域列表失败: ' + err.message, 500);
    }
}

// ================================================================
// 路由入口
// ================================================================

export async function onRequest(context) {
    const { request } = context;
    const method = request.method;

    if (method === 'GET') {
        return onRequestGet(context);
    }

    return error('方法不允许', 405);
}
