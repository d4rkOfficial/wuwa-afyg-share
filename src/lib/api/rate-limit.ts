// 简单内存限频（滑动窗口）。部署在 Cloudflare Worker 单实例时有效；
// 仅作滥用减速带，不构成严格防刷。

import { CORS_HEADERS } from '@/lib/api/cors'

const buckets = new Map<string, number[]>()

const MAX_BUCKETS = 5000

/** @desc 判断 key 是否放行；limit 次 / windowMs 毫秒 内超过则拒绝 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now()
    const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
    if (arr.length >= limit) {
        buckets.set(key, arr)
        return false
    }
    arr.push(now)
    buckets.set(key, arr)
    if (buckets.size > MAX_BUCKETS) {
        for (const [k, v] of buckets) {
            if (v.length === 0 || now - v[v.length - 1] > windowMs) buckets.delete(k)
        }
    }
    return true
}

/** @desc 构造 429 响应（仅服务端路由使用，带 CORS 头） */
export function rateLimited(): Response {
    return Response.json({ error: '操作过于频繁，请稍后再试' }, { status: 429, headers: CORS_HEADERS })
}
