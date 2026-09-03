/**
 * ================================================================
 * 设备运行监控系统 - 区域管理 API
 * ================================================================
 */

function success(data, message = '操作成功') {
    return new Response(
        JSON.stringify({ success: true, message, data }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
}

function error(message = '操作失败', status = 400) {
    return new Response(
        JSON.stringify({ success: false, error: message, data: null }),
        { status, headers: { 'Content-Type': 'application/json' } }
    );
}

export async function onRequest(context) {
    const { request } = context;
    const method = request.method;

    if (method !== 'GET') {
        return error('方法不允许', 405);
    }

    // 直接返回硬编码数据，不查数据库
    const data = [
        { id: 1, name: '动力一工段', sort_order: 1 },
        { id: 2, name: '动力二工段', sort_order: 2 },
        { id: 3, name: '污水站', sort_order: 3 },
        { id: 4, name: '罐区', sort_order: 4 }
    ];

    return success(data);
}
