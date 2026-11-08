// 上下文用量估算（不引分词库，按字符粗估）。
//
// 目的只是给用户一个「还剩多少余量」的量级判断，不用于计费：
// - CJK 字符约 1 token/字（含标点）
// - ASCII 约 4 字符 1 token
// 结论偏保守（宁高勿低）。
import type { ChatMessage } from '@/lib/ai/client'

/**
 * @desc DeepSeek-V4 全系（含 deepseek-v4-flash）官方支持 **1M 上下文**，1M 已是官方默认。
 *  见官方发布说明：https://api-docs.deepseek.com/news/news260424
 *  这里按 1,000,000 建预算；换模型（如第三方兼容端点上限更小）时改这一个常量即可。
 */
export const CONTEXT_BUDGET = 1_000_000

/** @desc 到达预算的这个比例就自动压缩历史（留出输出与工具结果的余量） */
export const AUTO_COMPRESS_RATIO = 0.8

export function estimateTokens(text: string): number {
    let cjk = 0
    let ascii = 0
    for (const ch of text) {
        if (ch.charCodeAt(0) > 0x2e80) cjk += 1
        else ascii += 1
    }
    return Math.ceil(cjk * 1.05 + ascii / 4)
}

export function estimateMessagesTokens(messages: ChatMessage[]): number {
    let total = 0
    for (const m of messages) {
        total += 8 // 角色/结构开销
        total += estimateTokens(m.content ?? '')
        if (m.tool_calls) total += estimateTokens(JSON.stringify(m.tool_calls))
    }
    return total
}

/** @desc 是否该自动压缩了（消息太少时压了也没意义，交给调用方判断条数） */
export const shouldAutoCompress = (messages: ChatMessage[]): boolean =>
    estimateMessagesTokens(messages) >= CONTEXT_BUDGET * AUTO_COMPRESS_RATIO

export const formatTokens = (n: number): string =>
    n >= 1_000_000
        ? `${(n / 1_000_000).toFixed(2)}M`
        : n >= 1000
          ? `${(n / 1000).toFixed(1)}k`
          : String(n)
