/** @desc 拼 className：过滤掉 false / null / undefined / 空串 */
export function cn(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ')
}
