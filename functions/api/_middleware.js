// functions/api/_middleware.js
// 这个文件会拦截所有 /api/* 请求，然后手动分发

// 导入 records.js 里的处理函数
import { onRequest as recordsOnRequest } from './records.js';

export async function onRequest(context) {
    const url = new URL(context.request.url);
    const path = url.pathname;

    // 如果路径以 /api/records 开头，交给 records.js 处理
    if (path.startsWith('/api/records')) {
        return recordsOnRequest(context);
    }

    // 如果路径以 /api/types 开头，交给 types.js 处理
    if (path.startsWith('/api/types')) {
        const { onRequest: typesOnRequest } = await import('./types.js');
        return typesOnRequest(context);
    }

    // 如果路径以 /api/devices 开头，交给 devices.js 处理
    if (path.startsWith('/api/devices')) {
        const { onRequest: devicesOnRequest } = await import('./devices.js');
        return devicesOnRequest(context);
    }

    // 如果路径以 /api/auth 开头，交给 auth.js 处理
    if (path.startsWith('/api/auth')) {
        const { onRequest: authOnRequest } = await import('./auth.js');
        return authOnRequest(context);
    }

    // 其他 /api 请求返回 404
    return new Response(JSON.stringify({ success: false, error: '接口不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
    });
}
