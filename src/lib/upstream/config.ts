// ── 上游数据来源模式 ──────────────────────────────────────────────────────
// direct：直连上游（nanoka），与 wuwa-afyg-tool 同源逻辑，不再经过 tool 的 API。
// tool_api：仍走 wuwa-afyg-tool 的公开 API（兼容/回滚用）。
//
// 默认 tool_api：行为与改造前完全一致；确认稳定后把
// NEXT_PUBLIC_UPSTREAM_MODE 设为 direct 即可切换。

export type UpstreamMode = 'direct' | 'tool_api'

// 默认直连上游（nanoka）。当且仅当显式设置 NEXT_PUBLIC_UPSTREAM_MODE=tool_api 时，
// 才回退到旧的 wuwa-afyg-tool 公开 API（兼容/应急用）。
export function getUpstreamMode(): UpstreamMode {
    const v = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_UPSTREAM_MODE : undefined
    return v === 'tool_api' ? 'tool_api' : 'direct'
}
