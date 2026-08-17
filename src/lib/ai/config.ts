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
    /** 'off' = 不发送 reasoning_effort 参数（兼容严格模式的 OpenAI 兼容提供商） */
    reasoningEffort: 'off' | 'low' | 'medium' | 'high'
}

// 快捷端点预设。region 用于弹出选择器分组：
// 'cn' 国内 | 'intl' 国外 | 'local' 本地自建
export interface AiEndpointPreset {
    label: string
    value: string
    region: 'cn' | 'intl' | 'local'
    /** 该端点的模型名通常需按厂家填写 */
    modelHint?: string
}

export const AI_ENDPOINTS: AiEndpointPreset[] = [
    // 国内
    { label: 'DeepSeek（官方）', value: 'https://api.deepseek.com', region: 'cn', modelHint: 'deepseek-v4-flash 等' },
    { label: '阿里云 百炼 DashScope', value: 'https://dashscope.aliyuncs.com/compatible-mode/v1', region: 'cn', modelHint: 'qwen-plus / qwen-max 等' },
    { label: '智谱 AI BigModel', value: 'https://open.bigmodel.cn/api/paas/v4', region: 'cn', modelHint: 'glm-5 / glm-4.5 等' },
    { label: 'Moonshot Kimi', value: 'https://api.moonshot.cn/v1', region: 'cn', modelHint: 'moonshot-v1-8k 等' },
    { label: '字节 火山引擎 豆包', value: 'https://ark.cn-beijing.volces.com/api/v3', region: 'cn', modelHint: 'doubao-*（endpoint id）' },
    { label: '腾讯 混元', value: 'https://api.hunyuan.cloud.tencent.com/v1', region: 'cn', modelHint: 'hunyuan-turbo 等' },
    // 国外
    { label: 'OpenAI', value: 'https://api.openai.com/v1', region: 'intl', modelHint: 'gpt-5 / gpt-4o 等' },
    { label: 'OpenRouter', value: 'https://openrouter.ai/api/v1', region: 'intl', modelHint: 'openai/gpt-5、anthropic/claude-sonnet-4 等' },
    { label: 'Google Gemini（兼容端点）', value: 'https://generativelanguage.googleapis.com/v1beta/openai', region: 'intl', modelHint: 'gemini-2.5-pro 等' },
    { label: 'Groq', value: 'https://api.groq.com/openai/v1', region: 'intl', modelHint: 'llama-3.3-70b-versatile 等' },
    { label: 'Together AI', value: 'https://api.together.xyz/v1', region: 'intl', modelHint: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo 等' },
    // 本地 / 自建（需站点代理显式放行，默认包含以下地址）
    { label: 'Ollama（本地）', value: 'http://localhost:11434/v1', region: 'local', modelHint: 'llama3.1 等' },
    { label: 'vLLM（自建）', value: 'http://localhost:8000/v1', region: 'local', modelHint: '你部署的模型名' }
]

// 模型快捷预设（常见 OpenAI 兼容模型名；仅示例，可在输入框任意填写）
export interface AiModelPreset {
    label: string
    value: string
    region: 'cn' | 'intl'
    /** 归属端点（可选，用于提示） */
    endpoint?: string
}

export const AI_MODEL_PRESETS: AiModelPreset[] = [
    // 国内
    { label: 'deepseek-v4-flash（付费）', value: 'deepseek-v4-flash', region: 'cn' },
    { label: 'deepseek-v4-flash-free（免费）', value: 'deepseek-v4-flash-free', region: 'cn' },
    { label: 'deepseek-v4-pro', value: 'deepseek-v4-pro', region: 'cn' },
    { label: 'glm-5.1', value: 'glm-5.1', region: 'cn' },
    { label: 'glm-5.2', value: 'glm-5.2', region: 'cn' },
    { label: 'qwen-max', value: 'qwen-max', region: 'cn' },
    { label: 'kimi-k2', value: 'kimi-k2', region: 'cn' },
    // 国外
    { label: 'gpt-5', value: 'gpt-5', region: 'intl' },
    { label: 'gpt-4o', value: 'gpt-4o', region: 'intl' },
    { label: 'gemini-2.5-pro', value: 'gemini-2.5-pro', region: 'intl' },
    { label: 'claude-sonnet-4', value: 'claude-sonnet-4', region: 'intl' },
    { label: 'llama-3.3-70b-versatile', value: 'llama-3.3-70b-versatile', region: 'intl' }
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
