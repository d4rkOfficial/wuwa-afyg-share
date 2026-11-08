// 主题判定的唯一实现（服务端首帧脚本与顶栏开关共用同一套规则）。
// 之前这份逻辑在 layout.tsx 与 theme-toggle.tsx 各写了一遍，改一处必须记得改两处。
export const THEME_KEY = 'share-theme'

export type ThemeName = 'light' | 'dark'

/** @desc 工具箱 iframe 打开时通过 `#theme=light|dark` 透传当前偏好，优先级最高 */
export function hashTheme(): ThemeName | null {
    if (typeof window === 'undefined') return null
    try {
        const matched = /(?:^|&)theme=(light|dark)(?:&|$)/.exec(window.location.hash.replace(/^#/, ''))
        return matched ? (matched[1] as ThemeName) : null
    } catch {
        return null
    }
}

export function readSavedTheme(): ThemeName | null {
    if (typeof window === 'undefined') return null
    try {
        const value = localStorage.getItem(THEME_KEY)
        return value === 'light' || value === 'dark' ? value : null
    } catch {
        return null
    }
}

/** @desc 生效主题：hash > 本地保存 > 系统偏好 */
export function resolveTheme(): ThemeName {
    const explicit = hashTheme() ?? readSavedTheme()
    if (explicit) return explicit
    if (typeof window === 'undefined') return 'dark'
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: ThemeName): void {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.style.colorScheme = theme
}

/** @desc 切换并落盘，返回切换后的主题 */
export function toggleTheme(): ThemeName {
    const next: ThemeName = document.documentElement.classList.contains('light') ? 'dark' : 'light'
    applyTheme(next)
    try {
        localStorage.setItem(THEME_KEY, next)
    } catch {}
    return next
}

/** @desc 首帧脚本（内联到 <head>，避免闪白）：逻辑与上面保持一致 */
export const themeInitScript = `
(() => {
    var saved = null;
    try { saved = localStorage.getItem('${THEME_KEY}'); } catch (e) {}
    var fromHash = null;
    try {
        var matched = /(?:^|&)theme=(light|dark)(?:&|$)/.exec(window.location.hash.replace(/^#/, ''));
        if (matched) fromHash = matched[1];
    } catch (e) {}
    if (fromHash) {
        saved = fromHash;
        try { localStorage.setItem('${THEME_KEY}', fromHash); } catch (e) {}
    }
    var light = saved === 'light' || (saved !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.classList.toggle('light', light);
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
})();`
