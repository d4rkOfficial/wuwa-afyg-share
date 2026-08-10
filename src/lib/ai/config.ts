// AI 连接配置（IndexedDB 持久化；首次自动迁移旧 localStorage 配置）
// 对齐工具箱端 AI 配置：地址/模型/Key/思考强度，可接入任意 OpenAI 兼容端点与模型

const AI_CONFIG_KEY = 'ai-config'

// 旧 localStorage 键（迁移用）
const LEGACY_KEYS = {
    baseUrl: 'wuwa-afyg:ai-base-url',
    model: 'wuwa-afyg:ai-model',
    apiKey: 'wuwa-afyg:deepseek-api-key',
    reasoningEffort: 'wuwa-afyg:deepseek-reasoning-effort'
} as const

export interface AiConfig {
    baseUrl: string
    model: string
    apiKey: string
    reasoningEffort: 'low' | 'medium' | 'high'
}

// 快捷端点（可扩展）
export const AI_ENDPOINTS: Array<{ label: string; value: string }> = [
    { label: 'DeepSeek 官方', value: 'https://api.deepseek.com' },
    { label: 'opencode-go', value: 'https://opencode.ai/zen/go/v1' },
    { label: 'opencode 免费', value: 'https://opencode.ai/zen/v1' }
]

// 模型快捷预设（opencode-go / DeepSeek 常用；可扩展任意模型）
export const AI_MODEL_PRESETS: Array<{ label: string; value: string }> = [
    { label: 'deepseek-v4-flash（付费）', value: 'deepseek-v4-flash' },
    { label: 'deepseek-v4-flash-free（免费）', value: 'deepseek-v4-flash-free' },
    { label: 'deepseek-v4-pro', value: 'deepseek-v4-pro' },
    { label: 'glm-5.1', value: 'glm-5.1' },
    { label: 'glm-5.2', value: 'glm-5.2' }
]

export const DEFAULT_AI_CONFIG: AiConfig = {
    baseUrl: 'https://opencode.ai/zen/go/v1',
    model: 'deepseek-v4-flash',
    apiKey: '',
    reasoningEffort: 'medium'
}

let _config: AiConfig = { ...DEFAULT_AI_CONFIG }
let _loaded = false
let _dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('indexedDB unavailable'))
    if (_dbPromise) return _dbPromise
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('wuwa-share-v1', 1)
        req.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result
            if (!db.objectStoreNames.contains('kv')) {
                db.createObjectStore('kv', { keyPath: 'key' })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
    return _dbPromise
}

async function idbGet<T>(key: string): Promise<T | null> {
    try {
        const db = await openDb()
        return await new Promise<T | null>((resolve, reject) => {
            const tx = db.transaction('kv', 'readonly')
            const req = tx.objectStore('kv').get(key)
            req.onsuccess = () => resolve((req.result as { data: T } | undefined)?.data ?? null)
            req.onerror = () => reject(req.error)
        })
    } catch {
        return null
    }
}

async function idbSet(key: string, data: unknown): Promise<void> {
    try {
        const db = await openDb()
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('kv', 'readwrite')
            tx.objectStore('kv').put({ key, data })
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
    } catch {
        /* ignore */
    }
}

export async function loadAiConfig(): Promise<AiConfig> {
    if (typeof window === 'undefined' || _loaded) return _config
    const stored = await idbGet<Partial<AiConfig>>(AI_CONFIG_KEY)
    if (stored) {
        _config = { ...DEFAULT_AI_CONFIG, ...stored }
    } else {
        // 迁移旧 localStorage 配置
        const legacyBase = localStorage.getItem(LEGACY_KEYS.baseUrl)
        const legacyModel = localStorage.getItem(LEGACY_KEYS.model)
        const legacyKey = localStorage.getItem(LEGACY_KEYS.apiKey)
        const legacyEffort = localStorage.getItem(LEGACY_KEYS.reasoningEffort)
        if (legacyBase || legacyModel || legacyKey || legacyEffort) {
            _config = {
                baseUrl: legacyBase || DEFAULT_AI_CONFIG.baseUrl,
                model: legacyModel || DEFAULT_AI_CONFIG.model,
                apiKey: legacyKey ?? '',
                reasoningEffort: legacyEffort === 'low' || legacyEffort === 'high' ? legacyEffort : 'medium'
            }
            await idbSet(AI_CONFIG_KEY, _config)
        }
    }
    _loaded = true
    return _config
}

export function getAiConfig(): AiConfig {
    return _config
}

export async function saveAiConfig(patch: Partial<AiConfig>): Promise<AiConfig> {
    _config = { ..._config, ...patch }
    await idbSet(AI_CONFIG_KEY, _config)
    return _config
}
