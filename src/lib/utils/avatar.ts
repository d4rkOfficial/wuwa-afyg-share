// 用户名 → 游戏角色头像的确定性分配（纯前端可算、跨端一致）。
//
// 规则：把用户名做 FNV-1a 32 位哈希，再对「当前角色总数」取模得到下标；
// 角色按中文名排序后取第 index 个（排序是为了不依赖接口返回顺序 —— 上游对象顺序变化时
// 同一个人不应突然换头像）。同一用户名在任何页面 / 任何设备上都得到同一个头像。

export interface CharacterAvatar {
    /** @desc 角色名（用于 title / alt） */
    name: string
    /** @desc 头像图片地址 */
    url: string
}

/** @desc FNV-1a 32 位哈希（快、分布均匀、无需依赖） */
export function hashUsername(input: string): number {
    const text = String(input ?? '').trim()
    let hash = 0x811c9dc5
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    // 取无符号
    return hash >>> 0
}

/** @desc 稳定排序后的角色名列表（同一份图标表 → 同一顺序） */
export function sortedCharacterNames(icons: Record<string, string> | null | undefined): string[] {
    if (!icons) return []
    return Object.keys(icons)
        .filter((name) => !!icons[name])
        .sort((a, b) => a.localeCompare(b, 'zh'))
}

/**
 * @desc 头像池：按「排序后的角色名」顺序排好的 url 列表。
 * 客户端只需要这一串 url 就能算出同一个头像（不必把整张「角色名 → url」表传下去），
 * 所以「改名时头像实时预览」和「服务端渲染的头像」永远是同一个。
 */
export function avatarPool(icons: Record<string, string> | null | undefined): string[] {
    const pool: string[] = []
    for (const name of sortedCharacterNames(icons)) {
        const url = icons?.[name]
        if (url) pool.push(url)
    }
    return pool
}

/** @desc 用户名 + 头像池 → 头像地址（与 `pickCharacterAvatar` 同口径，客户端可算） */
export function pickAvatarFromPool(
    username: string | null | undefined,
    pool: ReadonlyArray<string>
): string | null {
    const name = String(username ?? '').trim()
    if (!name || pool.length === 0) return null
    return pool[hashUsername(name) % pool.length] ?? null
}

/**
 * @desc 用户名 → 角色头像。
 * @param username 用户名（空 / 非法时返回 null，调用方自行降级）
 * @param icons 角色名 → 头像地址（`getCharacterIcons()` 的返回值）
 */
export function pickCharacterAvatar(
    username: string | null | undefined,
    icons: Record<string, string> | null | undefined
): CharacterAvatar | null {
    const name = String(username ?? '').trim()
    if (!name) return null
    const names = sortedCharacterNames(icons)
    if (names.length === 0) return null
    const index = hashUsername(name) % names.length
    const picked = names[index]
    const url = icons?.[picked]
    return url ? { name: picked, url } : null
}

/** @desc 只算下标（供需要「角色总数」而暂时没有图标表的场景，如服务端预渲染占位） */
export function avatarIndexForUsername(username: string, characterCount: number): number {
    if (characterCount <= 0) return 0
    return hashUsername(username) % characterCount
}
