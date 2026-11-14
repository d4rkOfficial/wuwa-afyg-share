// AI 控制台（/agent/*）的类型：任务 = 一段可恢复的对话 + 活动流 + 审批记录。
//
// 为什么任务即会话：AI 的每一步都可能要人工审批，页面刷新/关浏览器后必须能接着做，
// 所以「对话消息 + 已产生的活动流 + 待审批项」是一个整体，整份存 IndexedDB。
import type { ChatMessage } from '@/lib/ai/client'
import type { BuffScope, BuffCondition } from '@/lib/types/db'

export type AgentRole = 'admin' | 'user'

/** @desc 审批项的差异行（UI 按 kind 上色，AI 不生成这层，由执行器算） */
/** @desc 差异行里的字段级明细（旧值 → 新值），审批卡按表格渲染 */
export interface ApprovalDiffField {
    label: string
    from?: string
    to?: string
}

export interface ApprovalDiffRow {
    kind: 'add' | 'update' | 'delete' | 'info'
    /** @desc 主体名（实体名 / 角色名 / 工程标题 / buff 全名） */
    name: string
    /** @desc 补充说明（旧值 → 新值、乘区摘要等） */
    detail?: string
    /** @desc 字段级明细（buff 的 folder/scope/condition/各乘区新旧值） */
    fields?: ApprovalDiffField[]
}

export interface ApprovalRequest {
    id: string
    /** @desc 工具名（upsert_buff 等），审批卡上显示「AI 想执行 xxx」 */
    toolName: string
    /** @desc 一句话动作，如「新增 1 条 Buff」 */
    title: string
    /** @desc 目标（实体/角色/工程），便于人快速判断范围 */
    target: string
    diff: ApprovalDiffRow[]
    /** @desc 原始入参（折叠显示，供核对） */
    payload?: unknown
    createdAt: number
}

export interface ApprovalDecision {
    approved: boolean
    /** @desc 拒绝时的理由，会作为工具结果回喂给模型 */
    comment?: string
}

export interface ApprovalLogEntry {
    id: string
    toolName: string
    title: string
    target: string
    approved: boolean
    comment?: string
    at: number
}

/** @desc 活动流（渲染顺序 = 发生顺序） */
export type AgentActivity =
    | { kind: 'user'; text: string }
    | { kind: 'ask'; question: string; options?: string[]; answer?: string }
    | { kind: 'text'; text: string }
    | { kind: 'reasoning'; text: string }
    | { kind: 'status'; text: string }
    | { kind: 'tool'; name: string; args: Record<string, unknown>; ok?: boolean; resultText?: string }
    | { kind: 'approval'; request: ApprovalRequest; decision?: ApprovalDecision }
    | { kind: 'error'; text: string }

export type TaskStatus = 'idle' | 'running' | 'waiting-approval' | 'done' | 'error' | 'interrupted'

export interface AgentTask {
    id: string
    /** @desc 会话标题（首条用户输入的前 40 字） */
    title: string
    status: TaskStatus
    messages: ChatMessage[]
    activities: AgentActivity[]
    approvalLog: ApprovalLogEntry[]
    /** @desc 待审批项（页面恢复时据此重新弹审批卡） */
    pendingApproval: ApprovalRequest | null
    error?: string
    createdAt: number
    updatedAt: number
}

/** @desc 工具执行后回喂给模型的结果 */
export interface ToolResult {
    /** @desc 回给模型的文本（人类可读的 JSON 也行） */
    text: string
    /** @desc 供 UI 展示的原始结果（可选） */
    raw?: unknown
}

export interface AgentBuffZone {
    zoneId: string
    value: number
    override?: boolean
    condition?: BuffCondition | null
    ref?: {
        targetZoneId: string
        pct: number
        threshold?: number
        lower?: number
        upper?: number
        discrete?: boolean
        divisor?: number
        multiplier?: number
        /** @desc 引用归属：本角色（self/owner）/ 出伤者（active） */
        refOwner?: 'self' | 'owner' | 'active'
    } | null
}

export interface AgentBuff {
    buffName: string
    folder?: string
    scope?: BuffScope
    exclusive?: boolean
    condition?: BuffCondition | null
    zones: AgentBuffZone[]
}
