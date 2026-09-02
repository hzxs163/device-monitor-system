// 临时绕过所有权限检查
export async function onRequest(context) {
    return await context.next();
}
