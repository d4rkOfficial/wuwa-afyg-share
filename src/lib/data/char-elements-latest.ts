import { CHAR_ELEMENTS } from './char-elements'

const MANIFEST_URL = 'https://static.nanoka.cc/manifest.json'
const ELEMENT_BY_ID = ['', '冷凝', '热熔', '导电', '气动', '衍射', '湮灭']

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

export async function fetchLatestCharElements(): Promise<LatestCharElements> {
    const manifestResponse = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (!manifestResponse.ok) throw new Error(`manifest HTTP ${manifestResponse.status}`)

    const manifest = (await manifestResponse.json()) as ManifestData
    const version = typeof manifest.ww?.latest === 'string' ? manifest.ww.latest : ''
    if (!version) throw new Error('manifest 缺少鸣潮最新版本')

    const dataResponse = await fetch(
        `https://static.nanoka.cc/ww/${encodeURIComponent(version)}/character.json`,
        { cache: 'no-store' }
    )
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

export async function getLatestCharElements(): Promise<LatestCharElements> {
    try {
        return await fetchLatestCharElements()
    } catch {
        return { version: 'generated-fallback', elements: CHAR_ELEMENTS }
    }
}