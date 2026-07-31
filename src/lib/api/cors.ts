// 公共 API 的 CORS 支持（椰果工具箱等第三方客户端跨域访问）
export const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

export function handleOptions(): Response {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
}
