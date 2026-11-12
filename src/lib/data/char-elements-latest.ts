// 角色名 → 属性（服务端）：**只从上游读，不在仓库里存任何快照**。
//
// 上游是 `static.nanoka.cc` 的 manifest + character.json，随游戏版本自动更新，
// 新角色不需要改代码、不需要重新部署就能出现在页面上。
//
// 缓存策略：
// - 成功的结果缓存 6 小时（属性只在版本更新时变），一个 worker 只打几次上游；
// - 并发请求共用同一个 in-flight Promise，冷启动不会同时打几十次；
// - **失败不缓存、也不回退到任何写死的数据**：拿不到就返回空表，由调用方明确提示
//   「属性数据暂不可用」。宁可少显示，也不要显示一份可能过期的角色表。
const MANIFEST_URL = 'https://static.nanoka.cc/manifest.json'
const CHARACTER_URL = (version: string) => `https://static.nanoka.cc/ww/${encodeURIComponent(version)}/character.json`
const ELEMENT_BY_ID = ['', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭']

/** @desc 上游数据缓存时长 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface CharacterData {
    zh?: unknown
    element?: unknown
}

interface ManifestData {
    ww?: {
        latest?: unknown
    }
}

export interface LatestCharElements {
    /** @desc 上游数据版本（拿不到时为 `''`） */
    version: string
    /** @desc 角色名 → 属性；上游不可用时是空对象 */
    elements: Record<string, string>
}

interface CacheEntry {
    at: number
    value: LatestCharElements
}

const EMPTY: LatestCharElements = { version: '', elements: {} }

let cache: CacheEntry | null = null
let inFlight: Promise<LatestCharElements> | null = null

/** @desc 直接打上游（不做任何缓存与兜底）；失败抛错，由 `getLatestCharElements` 统一处理 */
export async function fetchLatestCharElements(): Promise<LatestCharElements> {
    const manifestResponse = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (!manifestResponse.ok) throw new Error(`manifest HTTP ${manifestResponse.status}`)

    const manifest = (await manifestResponse.json()) as ManifestData
    const version = typeof manifest.ww?.latest === 'string' ? manifest.ww.latest : ''
    if (!version) throw new Error('manifest 缺少鸣潮最新版本')

    const dataResponse = await fetch(CHARACTER_URL(version), { cache: 'no-store' })
    if (!dataResponse.ok) throw new Error(`character.json HTTP ${dataResponse.status}`)

    const data = (await dataResponse.json()) as Record<string, CharacterData>
    const elements: Record<string, string> = {}
    for (const character of Object.values(data)) {
        const name = typeof character.zh === 'string' ? character.zh : ''
        const element = typeof character.element === 'number' ? ELEMENT_BY_ID[character.element] ?? '' : ''
        if (name && element) elements[name] = element
    }

    if (Object.keys(elements).length === 0) throw new Error('character.json 没有有效角色数据')
    return { version, elements }
}

/**
 * @desc 带缓存的上游数据。
 * 上游不可用时返回空表（`elements` 为 `{}`、`version` 为 `''`），**不返回任何历史快照**：
 * 调用方据此显示「属性数据暂不可用」，而不是拿一份过期角色表去猜属性。
 */
export async function getLatestCharElements(): Promise<LatestCharElements> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
    if (inFlight) return inFlight

    inFlight = (async () => {
        try {
            const value = await fetchLatestCharElements()
            cache = { at: Date.now(), value }
            return value
        } catch {
            return EMPTY
        } finally {
            inFlight = null
        }
    })()

    return inFlight
}

/** @desc 页面直接要的那张表：角色名 → 属性（空表表示上游暂不可用） */
export async function getCharElements(): Promise<Record<string, string>> {
    return (await getLatestCharElements()).elements
}
