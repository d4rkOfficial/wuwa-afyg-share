// AI 控制台的本地设置：**只保留「补充说明」**。
//
// 命名规则与黑话词典已写死在代码里（lib/agent/prompt.ts + ai/prompts.config.ts），
// 不再提供 UI 编辑、也不再读写 localStorage —— 避免各人本机存一份旧规范把生成口径带偏。
export interface PromptSettings {
    /** @desc 追加到系统提示末尾的补充说明（项目约定、口径偏好） */
    extra: string
}

const EXTRA_STORAGE = 'wuwa-afyg:agent-extra'

function read(key: string): string {
    if (typeof window === 'undefined') return ''
    try {
        return window.localStorage.getItem(key) ?? ''
    } catch {
        return ''
    }
}

function write(key: string, value: string) {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(key, value)
    } catch {
        /* 隐私模式下写不了就算了，本次会话仍生效 */
    }
}

export function loadPromptSettings(): PromptSettings {
    return { extra: read(EXTRA_STORAGE) }
}

export function savePromptSettings(settings: PromptSettings) {
    write(EXTRA_STORAGE, settings.extra)
}

export const PROMPT_SETTINGS_DEFAULTS: PromptSettings = { extra: '' }
