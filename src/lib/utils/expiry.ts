// 工程有效期工具：非匿名工程过期后额外宽限一周（直接链接仍可访问）
const GRACE_MS = 7 * 24 * 60 * 60 * 1000

export function isAnonymousName(name?: string | null): boolean {
    return !name || name.trim() === '匿名'
}

// 有效期限时间戳：无到期时间返回 null；非匿名工程在到期后追加一周宽限
export function effectiveExpiresAt(expiresAt: string | null | undefined, authorName?: string | null): number | null {
    if (!expiresAt) return null
    const t = new Date(expiresAt).getTime()
    if (isNaN(t)) return null
    return isAnonymousName(authorName) ? t : t + GRACE_MS
}

// 是否真正失效（超过有效期限含宽限）
export function isExpiredProject(
    expiresAt: string | null | undefined,
    authorName?: string | null,
    now = Date.now()
): boolean {
    const eff = effectiveExpiresAt(expiresAt, authorName)
    return eff !== null && now >= eff
}

// 是否处于宽限期（已到到期日但还在宽限内，仅非匿名工程）
export function isGracePeriod(expiresAt: string | null | undefined, authorName?: string | null, now = Date.now()): boolean {
    if (!expiresAt) return false
    const due = new Date(expiresAt).getTime()
    if (isNaN(due) || isAnonymousName(authorName)) return false
    const eff = due + GRACE_MS
    return now >= due && now < eff
}
