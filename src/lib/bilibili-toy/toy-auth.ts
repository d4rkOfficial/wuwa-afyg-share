// Bilibili Toy 身份透传工具（仅前端，客户端组件使用）
// 宿主链路：Toy 壳页(bilibili.com) → 椰果工具箱 iframe → 椰果工坊 iframe
// 身份通过 URL hash `#toy=<encodeURIComponent(json)>` 透传，非 Toy 环境时 hash 为空，一切保持原样。
// 注意：toyOpenId 是 Toy 内假名标识，非鉴权凭证；本模块仅作展示性身份，绝不写入日志。

export interface ToyIdentity {
    nickname: string
    avatar: string
    toyOpenId: string
}

export const TOY_HASH_KEY = 'toy'

const STORAGE_KEY = 'wuwa-afyg:toy-identity'

const MAX_NICKNAME_LENGTH = 30

/** @desc 解析 hash 中的 #toy=<encodeURIComponent(json)>；格式非法返回 null（纯函数） */
export function parseToyHash(hash: string): ToyIdentity | null {
    const body = hash.startsWith('#') ? hash.slice(1) : hash
    for (const pair of body.split('&')) {
        const eq = pair.indexOf('=')
        if (eq < 0) continue
        const key = pair.slice(0, eq)
        if (key !== TOY_HASH_KEY) continue
        try {
            const raw = JSON.parse(decodeURIComponent(pair.slice(eq + 1)))
            if (typeof raw !== 'object' || raw === null) return null
            const nickname = String(raw.nickname ?? '').trim().slice(0, MAX_NICKNAME_LENGTH)
            const avatar = String(raw.avatar ?? '')
            const toyOpenId = String(raw.toyOpenId ?? '')
            if (!nickname || !toyOpenId) return null
            if (!/^https:\/\//.test(avatar)) return null
            return { nickname, avatar, toyOpenId }
        } catch {
            return null
        }
    }
    return null
}

/**
 * @desc 读取 B站 身份：优先当前页面 hash，其次 sessionStorage 兜底。
 *   工坊站内部导航（Next.js Link / 登录回跳）不保留 hash，身份会话内持久化到 sessionStorage，
 *   保证登录后回到 /me、/upload 仍能识别 B站 身份。
 */
export function getToyIdentity(): ToyIdentity | null {
    if (typeof window === 'undefined') return null
    const fromHash = parseToyHash(window.location.hash)
    if (fromHash) {
        try {
            sessionStorage.setItem(STORAGE_KEY, window.location.hash)
        } catch {
            // sessionStorage 不可用时仅依赖 URL hash
        }
        return fromHash
    }
    try {
        const saved = sessionStorage.getItem(STORAGE_KEY)
        if (saved) return parseToyHash(saved)
    } catch {
        // ignore
    }
    return null
}

/** @desc 计算 toyOpenId 的 SHA-256 hex（Web Crypto；服务器只存哈希，不接触明文） */
export async function sha256Hex(text: string): Promise<string> {
    if (!text) return ''
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface ToyCredential {
    nickname: string
    hash: string
}

/** @desc 从当前页面 hash 提取署名凭据（昵称 + toyOpenId 哈希）；无身份返回 null */
export async function getToyCredential(): Promise<ToyCredential | null> {
    const identity = getToyIdentity()
    if (!identity) return null
    return { nickname: identity.nickname, hash: await sha256Hex(identity.toyOpenId) }
}
