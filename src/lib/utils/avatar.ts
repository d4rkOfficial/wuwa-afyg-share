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
