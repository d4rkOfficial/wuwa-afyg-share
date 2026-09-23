// 角色名 → 属性：客户端取数模块（fetch + localStorage 缓存）
// 静态表已搬至 ./char-elements.generated（服务端专用），客户端不得 import
export const CHAR_ELEMENTS_CACHE_KEY = 'wuwa-afyg:char-elements'

let latestElementsPromise: Promise<Record<string, string>> | null = null

// 同步读取 localStorage 缓存；无缓存或解析失败返回空对象
export function readCachedCharElements(): Record<string, string> {
    if (typeof window === 'undefined') return {}
    try {
        const cached = JSON.parse(localStorage.getItem(CHAR_ELEMENTS_CACHE_KEY) ?? '') as { elements?: unknown }
        if (cached.elements && typeof cached.elements === 'object') return cached.elements as Record<string, string>
    } catch {}
    return {}
}

// 单例 promise：请求 /api/char-elements 并写缓存；失败只回落本地缓存，再失败返回空对象
export async function loadCharElements(): Promise<Record<string, string>> {
    if (latestElementsPromise) return latestElementsPromise

    latestElementsPromise = fetch('/api/char-elements', { cache: 'no-store' })
        .then((response) => {
            if (!response.ok) throw new Error('角色数据获取失败')
            return response.json() as Promise<{ elements?: unknown }>
        })
        .then((data) => {
            if (!data.elements || typeof data.elements !== 'object') throw new Error('角色数据格式错误')
            const elements = data.elements as Record<string, string>
            try { localStorage.setItem(CHAR_ELEMENTS_CACHE_KEY, JSON.stringify({ elements })) } catch {}
            return elements
        })
        .catch(() => readCachedCharElements())

    return latestElementsPromise
}

export async function charElement(name: string): Promise<string> {
    const elements = await loadCharElements()
    return elements[name] ?? ''
}
