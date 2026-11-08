/**
 * @desc Buff 全名工具（工坊侧）：全名用反斜杠分隔，工坊最多一级文件夹。
 * - 短名/文件夹名允许 `/`，禁止 `\`；
 * - 根 Buff 没有分隔符。
 */

export const BUFF_PATH_SEP = '\\'

export const splitBuffPath = (name: string): string[] =>
    String(name ?? '')
        .split(BUFF_PATH_SEP)
        .map((part) => part.trim())
        .filter(Boolean)

export const buffLeafName = (name: string): string => {
    const parts = splitBuffPath(name)
    return parts[parts.length - 1] ?? ''
}

export const buffFolderName = (name: string): string => {
    const parts = splitBuffPath(name)
    return parts.length > 1 ? parts[0] : ''
}

export const joinBuffPath = (...parts: readonly (string | null | undefined)[]): string =>
    parts
        .flatMap((part) => (part == null ? [] : splitBuffPath(String(part))))
        .filter(Boolean)
        .join(BUFF_PATH_SEP)

export const sanitizeLeafName = (name: string): string =>
    String(name ?? '')
        .trim()
        .replaceAll(BUFF_PATH_SEP, '/')
        .slice(0, 80)

/**
 * @desc 文件夹名清洗（AI 生成的「游戏原文案」段）。
 * 文件夹不能有分隔符，也不能带 `/`（那是短名里的层级写法），一律折叠成空格；
 * 连续空白压成一个，首尾空白与常见句末标点后的多余空格去掉。
 */
export const sanitizeFolderName = (name: string): string =>
    String(name ?? '')
        .replaceAll(BUFF_PATH_SEP, ' ')
        .replaceAll('/', ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)

/** @desc 工坊全名：最多一层文件夹；多余层级并入短名（/ 保留信息） */
export const normalizeShareBuffName = (name: string): string => {
    const parts = String(name ?? '')
        .split(BUFF_PATH_SEP)
        .map((part) => part.trim().replaceAll(BUFF_PATH_SEP, '/'))
        .filter(Boolean)
    if (parts.length <= 2) return joinBuffPath(...parts)
    return joinBuffPath(parts[0], parts.slice(1).join('/'))
}

export const uniqueLeafName = (desired: string, used: ReadonlySet<string>): string => {
    let name = desired
    while (used.has(name)) name += '#'
    return name
}
