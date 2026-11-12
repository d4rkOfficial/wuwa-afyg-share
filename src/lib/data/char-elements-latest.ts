// 角色名 → 属性（服务端）。
//
// 这份数据由上游随版本更新（新角色、复刻相关调整），**不能只靠仓库里的静态快照**：
// 快照是某个版本冻结的，新角色（如 3.8 的莉莉）会永远缺失，页面上就会被归进「未分类」。
//
// 策略（从快到慢）：
// 1. 进程内缓存：命中且未过期直接用（默认 6 小时，一个 worker 只打几次上游）；
// 2. 实时拉取：manifest → character.json，成功后写回缓存；
// 3. 静态快照：上游挂了 / 超时就退回 `char-elements.generated.ts`，页面仍可用（只是可能缺新角色）。
//
// 失败**不写缓存**：上游恢复后下一次请求立刻拿到新数据；并发请求共用同一个 in-flight Promise，
// 避免冷启动时几十个请求同时打上游。
import { CHAR_ELEMENTS } from './char-elements.generated'

const MANIFEST_URL = 'https://static.nanoka.cc/manifest.json'
const CHARACTER_URL = (version: string) => `https://static.nanoka.cc/ww/${encodeURIComponent(version)}/character.json`
const ELEMENT_BY_ID = ['', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭']

/** @desc 上游数据缓存时长：属性只在版本更新时变，没必要每次请求都拉 */
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
    version: string
    elements: Record<string, string>
}

interface CacheEntry {
    at: number
    value: LatestCharElements
}

let cache: CacheEntry | null = null
let inFlight: Promise<LatestCharElements> | null = null

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

/** @desc 带缓存的上游数据；失败退回静态快照（快照可能缺新角色，但页面不会白屏） */
export async function getLatestCharElements(): Promise<LatestCharElements> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
    if (inFlight) return inFlight

    inFlight = (async () => {
        try {
            const value = await fetchLatestCharElements()
            cache = { at: Date.now(), value }
            return value
        } catch {
            // 失败不写缓存：上游恢复后下个请求立即生效
            return { version: 'generated-fallback', elements: CHAR_ELEMENTS }
        } finally {
            inFlight = null
        }
    })()

    return inFlight
}

/** @desc 页面直接要的那张表：角色名 → 属性 */
export async function getCharElements(): Promise<Record<string, string>> {
    return (await getLatestCharElements()).elements
}
