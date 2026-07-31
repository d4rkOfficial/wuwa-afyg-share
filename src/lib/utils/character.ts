const SHORT_MAP: Record<string, string> = {
    // 常见长名 → 短名（按需扩充）
    漂泊者: '漂'
}

export function shortName(name: string): string {
    if (SHORT_MAP[name]) return SHORT_MAP[name]
    if (name.length <= 2) return name
    return name.slice(-2)
}
