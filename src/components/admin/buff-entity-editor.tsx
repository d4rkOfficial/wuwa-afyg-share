'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { upsertBuffEntity, deleteBuffEntity } from '@/lib/actions/buff-sets'
import { toast } from '@/components/ui/toast'
import {
    BUFF_ENTITY_LABELS,
    BUFF_ZONE_MAP,
    ZONE_NO_REF_IDS,
    ZONE_NO_OVERRIDE_IDS,
    BUFF_ZONE_SECTION_VIEWS,
    BUFF_REF_ZONE_MAP,
    BUFF_SCOPE_LABELS,
    BUFF_ELEMENTS,
    BUFF_DAMAGE_TYPES,
    BUFF_DAMAGE_TYPE_SHORT,
    CHAIN_MAX,
    REFINE_MAX,
    sanitizeCondition,
    sanitizeZoneCondition,
    isConditionEmpty,
    describeCondition,
    describeZoneConditionBadge,
    slotNameFor
} from '@/lib/consts/buff-zones'
import type { BuffEntityType, BuffScope, BuffSetRow, BuffCondition } from '@/lib/types/db'
import type { GeneratedBuff } from '@/lib/ai/types'
import type { ChatMessage } from '@/lib/ai/client'
import type { BuffDraftApi } from '@/lib/ai/tools'
import BuffRefModal from '@/components/admin/buff-ref-modal'
import BuffAiAssistant from '@/components/admin/buff-ai-assistant'

function gcd(a: number, b: number): number {
    a = Math.abs(a)
    b = Math.abs(b)
    while (b) {
        const t = b
        b = a % b
        a = t
    }
    return a
}

// pct → 最简分数（divisor/multiplier），用于引用摘要展示（对齐工具箱）
function simplifyPct(pct: number): { divisor: number; multiplier: number } {
    if (pct === 0) return { divisor: 1, multiplier: 0 }
    const num = Math.round(pct)
    const g = gcd(num, 100)
    return { divisor: 100 / g, multiplier: num / g }
}

/** @desc 实例级条件的参考角色槽位（工坊没有配队上下文，统一按 0 号位描述） */
const LIBRARY_CHAR_IDX = 0

const chainMinOf = (cond: BuffCondition | null | undefined): number | undefined =>
    cond?.chains?.[0]?.min ?? cond?.chain

interface Props {
    initial: {
        entityType: BuffEntityType
        entityName: string
        buffs: BuffSetRow[]
    }

    apiKey: string
    aiBaseUrl: string
    aiModel: string
    systemPrompt: string
    initialTaskPrompt: string
    toolPrompts: Record<string, string>
    slangDict: string
    reasoningEffort?: 'off' | 'low' | 'medium' | 'high'
    /** @desc AI 浏览器直连（不经站点转发代理） */
    aiDirect?: boolean
    /** @desc 用户自定义的 Buff 命名规则（连接配置里可改） */
    namingRule?: string
    isAdmin: boolean
    /** @desc 当前实体是否可编辑（编辑锁开着且该实体未被单独锁定；管理员恒为 true） */
    canEdit?: boolean
    // 跨实体共享会话（省 token / 缓存命中）
    sessionSeed?: ChatMessage[]
    onSessionUpdate?: (messages: ChatMessage[]) => void
    sessionShareEnabled?: boolean
    onEntityDeleted?: () => void
    onclose?: () => void
}

interface ZoneRefRow {
    targetZoneId: string
    pct: string
    threshold?: string
    lower?: string
    upper?: string
    discrete?: boolean
    divisor?: string
    multiplier?: string
    refOwner?: 'self' | 'owner'
}

interface ZoneRow {
    zoneId: string
    value: string
    override: boolean
    /** @desc 乘区级生效条件（只允许伤害类型 / 伤害属性；链阶由实例级统一把关） */
    condition: BuffCondition | null
    ref?: ZoneRefRow | null
}

interface BuffRow {
    buffName: string
    scope: BuffScope
    exclusive: boolean
    /** @desc 实例级生效条件（链 / 阶硬门槛，互斥） */
    condition?: BuffCondition | null
    zones: ZoneRow[]
}

/** @desc 乘区条件徽标（伤害类型在前、属性在后，类内 `/`、类间 `·`） */
const zoneConditionBadge = (cond: BuffCondition | null): string => describeZoneConditionBadge(cond)

export default function BuffEntityEditor({
    initial,

    apiKey,
    aiBaseUrl,
    aiModel,
    systemPrompt,
    initialTaskPrompt,
    toolPrompts,
    slangDict,
    reasoningEffort,
    aiDirect,
    namingRule,
    isAdmin,
    canEdit = true,
    sessionSeed,
    onSessionUpdate,
    sessionShareEnabled,
    onEntityDeleted,
    onclose
}: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [confirmDeleteEntity, setConfirmDeleteEntity] = useState(false)


    const entityType = initial.entityType
    const entityName = initial.entityName
    const [buffs, setBuffs] = useState<BuffRow[]>(
        initial.buffs.map((r) => ({
            buffName: r.buff_name,
            scope: r.scope ?? 'team',
            exclusive: !!r.exclusive,
            condition: sanitizeCondition(r.condition, 'buff') ?? null,
            zones: (r.buff_set ?? []).map((z) => ({
                zoneId: z.zoneId,
                value: String(z.value),
                override: !!z.override,
                condition: sanitizeZoneCondition(z.condition) ?? null,
                ref: z.ref
                    ? {
                          targetZoneId: z.ref.targetZoneId,
                          pct: String(z.ref.pct),
                          ...(z.ref.threshold !== undefined ? { threshold: String(z.ref.threshold) } : {}),
                          ...(z.ref.lower !== undefined ? { lower: String(z.ref.lower) } : {}),
                          ...(z.ref.upper !== undefined ? { upper: String(z.ref.upper) } : {}),
                          ...(z.ref.discrete ? { discrete: true } : {}),
                          ...(z.ref.divisor !== undefined ? { divisor: String(z.ref.divisor) } : {}),
                          ...(z.ref.multiplier !== undefined ? { multiplier: String(z.ref.multiplier) } : {}),
                          ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                      }
                    : null
            }))
        }))
    )


    const canSave = entityName.trim().length > 0

    function run(fn: () => Promise<unknown>): Promise<boolean> {
        return new Promise((resolve) => {
            startTransition(async () => {
                const res = await fn()
                const r = res as { error?: string; data?: { saved?: number } } | undefined
                if (r?.error) {
                    toast(r.error, 'error')
                    resolve(false)
                } else {
                    router.refresh()
                    resolve(true)
                }
            })
        })
    }

    // ── buff 列表与就地编辑 ──
    // 默认选中第一条：进来就有内容可编辑（窄屏下拉也才不会与状态不一致）
    const [activeBuffIdx, setActiveBuffIdx] = useState<number | null>(buffs.length > 0 ? 0 : null)
    const [condPanelOpen, setCondPanelOpen] = useState(false)
    /** @desc 展开行内「乘区条件」面板的乘区下标（同一乘区可有多条，故用下标定位） */
    const [expandedZoneIdx, setExpandedZoneIdx] = useState<number | null>(null)

    const activeBuff = activeBuffIdx !== null ? buffs[activeBuffIdx] : null
    const activeZones = activeBuff?.zones ?? []
    /** @desc 各乘区当前条目数（右栏「添加乘区」用；同一乘区可多条） */
    const zoneCounts = (() => {
        const map = new Map<string, number>()
        for (const z of activeZones) map.set(z.zoneId, (map.get(z.zoneId) ?? 0) + 1)
        return map
    })()

    /** @desc 各实体类型可配置的实例级硬门槛：角色 = 共鸣链、武器 = 精炼（与工具箱一致） */
    const canChain = entityType === 'character'
    const canRefinement = entityType === 'weapon'

    const conditionSummary = (() => {
        const cond = activeBuff?.condition
        if (!cond) return ''
        const parts: string[] = []
        const chain = chainMinOf(cond)
        if (chain !== undefined && canChain) parts.push(chain > 0 ? `≥${chain}链` : '本体')
        const refine = cond.refinements?.[0]?.min ?? cond.refinement
        if (refine !== undefined && canRefinement) parts.push(`武器 ≥${refine}阶`)
        return parts.join('，')
    })()

    const SCOPE_TABS: Array<{ value: BuffScope; label: string }> = [
        { value: 'self', label: '自己' },
        { value: 'self_except', label: '队友' },
        { value: 'team', label: '全队' },
        { value: 'effect_only', label: '效应' }
    ]

    function addBuff() {
        const next = [
            ...buffs,
            { buffName: '', scope: 'team' as BuffScope, exclusive: false, condition: null, zones: [] }
        ]
        setBuffs(next)
        setActiveBuffIdx(next.length - 1)
        setExpandedZoneIdx(null)
    }

    function removeBuffAt(idx: number) {
        setBuffs((prev) => prev.filter((_, i) => i !== idx))
        setActiveBuffIdx((prev) => {
            if (prev === null) return null
            if (prev === idx) return null
            return prev > idx ? prev - 1 : prev
        })
        setExpandedZoneIdx(null)
    }

    function updateActiveBuff(patch: Partial<BuffRow>) {
        if (activeBuffIdx === null) return
        setBuffs((prev) => prev.map((b, i) => (i === activeBuffIdx ? { ...b, ...patch } : b)))
    }

    function setBuffScope(scope: BuffScope) {
        updateActiveBuff({ scope, exclusive: scope === 'effect_only' })
    }

    /**
     * @desc 设置实例级链门槛（再次点击取消）。
     * 链与阶**互斥**：设置链会清空全部阶条件（与工具箱一致）。
     */
    function setBuffChain(min: number) {
        const cond = { ...(activeBuff?.condition ?? {}) }
        const clearing = chainMinOf(cond) === min
        const next: BuffCondition = { ...cond }
        delete next.chain
        delete next.refinement
        delete next.refinements
        if (clearing) delete next.chains
        else next.chains = [{ charIdx: LIBRARY_CHAR_IDX, min }]
        updateActiveBuff({ condition: next })
    }

    /** @desc 设置实例级阶门槛（再次点击取消）；设置阶会清空全部链条件 */
    function setBuffRefinement(min: number) {
        const cond = { ...(activeBuff?.condition ?? {}) }
        const current = cond.refinements?.[0]?.min ?? cond.refinement
        const clearing = current === min
        const next: BuffCondition = { ...cond }
        delete next.chains
        delete next.chain
        delete next.refinement
        if (clearing) delete next.refinements
        else next.refinements = [{ charIdx: LIBRARY_CHAR_IDX, min }]
        updateActiveBuff({ condition: next })
    }

    function clearBuffCondition() {
        updateActiveBuff({ condition: null })
        setCondPanelOpen(false)
    }

    /** @desc 添加一条乘区贡献条目（同一乘区可添加多次，各自独立配置） */
    function addZone(zoneId: string) {
        if (activeBuffIdx === null) return
        setBuffs((prev) =>
            prev.map((b, i) =>
                i === activeBuffIdx ? { ...b, zones: [...b.zones, { zoneId, value: '', override: false, condition: null, ref: null }] } : b
            )
        )
    }

    /** @desc 按下标移除某个乘区条目 */
    function removeZoneAt(idx: number) {
        if (activeBuffIdx === null) return
        setBuffs((prev) => prev.map((b, i) => (i === activeBuffIdx ? { ...b, zones: b.zones.filter((_, k) => k !== idx) } : b)))
        setExpandedZoneIdx((prev) => (prev === idx ? null : prev))
    }

    function patchZoneAt(idx: number, patch: Partial<ZoneRow>) {
        if (activeBuffIdx === null) return
        setBuffs((prev) =>
            prev.map((b, i) => (i === activeBuffIdx ? { ...b, zones: b.zones.map((z, k) => (k === idx ? { ...z, ...patch } : z)) } : b))
        )
    }

    /** @desc 切换覆盖：extraRatio / 百分比类乘区恒为追加；开启覆盖时清掉同乘区其它条目的覆盖（覆盖唯一） */
    function setZoneOverride(idx: number, override: boolean) {
        if (activeBuffIdx === null) return
        const target = activeZones[idx]
        if (!target) return
        const nextOverride = override && !ZONE_NO_OVERRIDE_IDS.has(target.zoneId)
        setBuffs((prev) =>
            prev.map((b, i) => {
                if (i !== activeBuffIdx) return b
                return {
                    ...b,
                    zones: b.zones.map((z, k) => {
                        if (k === idx) return { ...z, override: nextOverride, ref: nextOverride ? null : z.ref }
                        if (nextOverride && z.zoneId === target.zoneId && z.override) return { ...z, override: false }
                        return z
                    })
                }
            })
        )
    }

    // 乘区级条件的行内面板
    function toggleZoneCondition(idx: number) {
        setExpandedZoneIdx((prev) => (prev === idx ? null : idx))
    }

    function patchZoneCondition(idx: number, part: Partial<BuffCondition>) {
        const current = activeZones[idx]?.condition ?? {}
        const next: BuffCondition = { ...current, ...part }
        const clean = sanitizeZoneCondition(next) ?? null
        patchZoneAt(idx, { condition: clean })
    }

    function toggleZoneConditionDamageType(idx: number, dt: string) {
        const list = activeZones[idx]?.condition?.damageTypes ?? []
        const next = list.includes(dt) ? list.filter((d) => d !== dt) : [...list, dt]
        patchZoneCondition(idx, { damageTypes: next.length ? next : undefined })
    }

    function toggleZoneConditionElement(idx: number, el: string) {
        const list = activeZones[idx]?.condition?.elements ?? []
        const next = list.includes(el) ? list.filter((e) => e !== el) : [...list, el]
        patchZoneCondition(idx, { elements: next.length ? next : undefined })
    }

    // ── 引用配置弹窗（按下标定位，同一乘区可有多条） ──
    const [refTargetIdx, setRefTargetIdx] = useState<number | null>(null)
    const refZone = refTargetIdx !== null ? (activeZones[refTargetIdx] ?? null) : null

    function saveRef(ref: ZoneRefRow | null) {
        if (refTargetIdx === null) return
        patchZoneAt(refTargetIdx, { ref, ...(ref ? { override: false } : {}) })
        setRefTargetIdx(null)
    }

    /**
     * @desc 把编辑中的草稿行转成写入数据库的载荷（「保存」按钮与 AI 的「直接写入」共用）。
     *  非法乘区条目（空 zoneId / 数值非数字）在这一步被剔除，与历史行为一致。
     * @param rows 可选：按这份行数据生成载荷（AI 在同一轮里改了草稿但 React state 可能还没刷新）
     */
    function buildSavePayload(rows: BuffRow[] = buffs) {
        return rows.map((b) => {
            const zones = b.zones
                .map(
                    (z): { zoneId: string; value: number; override?: boolean; condition?: BuffCondition; ref?: unknown } | null => {
                        const n = Number(z.value)
                        if (!z.zoneId || Number.isNaN(n)) return null
                        const condition = sanitizeZoneCondition(z.condition)
                        return {
                            zoneId: z.zoneId,
                            value: n,
                            ...(condition ? { condition } : {}),
                            ...(z.ref
                                ? {
                                      ref: {
                                          targetZoneId: z.ref.targetZoneId,
                                          pct: Number(z.ref.pct) || 0,
                                          ...(z.ref.threshold !== undefined && z.ref.threshold !== ''
                                              ? { threshold: Number(z.ref.threshold) || 0 }
                                              : {}),
                                          ...(z.ref.lower !== undefined && z.ref.lower !== ''
                                              ? { lower: Number(z.ref.lower) || 0 }
                                              : {}),
                                          ...(z.ref.upper !== undefined && z.ref.upper !== ''
                                              ? { upper: Number(z.ref.upper) || 0 }
                                              : {}),
                                          ...(z.ref.discrete ? { discrete: true } : {}),
                                          ...(z.ref.divisor !== undefined && z.ref.divisor !== ''
                                              ? { divisor: Number(z.ref.divisor) || 0 }
                                              : {}),
                                          ...(z.ref.multiplier !== undefined && z.ref.multiplier !== ''
                                              ? { multiplier: Number(z.ref.multiplier) || 0 }
                                              : {}),
                                          ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                                      }
                                  }
                                : {}),
                            ...(z.override ? { override: true } : {})
                        }
                    }
                )
                .filter((z): z is { zoneId: string; value: number; override?: boolean; condition?: BuffCondition; ref?: unknown } => z !== null)
            const condition = sanitizeCondition(b.condition, 'buff')
            return {
                buffName: b.buffName,
                scope: b.scope,
                exclusive: b.exclusive,
                ...(condition ? { condition } : {}),
                zones
            }
        })
    }

    function onSave() {
        const name = entityName.trim()
        if (!name) {
            toast('请先选择实体名', 'error')
            return
        }
        const payload = buildSavePayload()
        const savedCount = payload.filter((b) => b.zones.length > 0).length
        run(() =>
            upsertBuffEntity({
                entityType,
                entityName: name,
                buffs: payload as Parameters<typeof upsertBuffEntity>[0]['buffs']
            })
        ).then((ok) => {
            if (ok) {
                toast(`已保存 ${savedCount} 条 Buff`, 'success')
            }
        })
    }

    /**
     * @desc AI 的「直接写入数据库」：与「保存」按钮同一条服务端链路（权限由服务端 actions 判定）。
     *  返回结构化结果而不是弹 toast，AI 才能知道成功 / 失败原因。
     * @param list 可选：写这份内容（AI 回合内的工作副本），缺省写编辑器当前状态
     */
    async function saveDraftDirect(
        list?: GeneratedBuff[]
    ): Promise<{ ok: boolean; error?: string; saved?: number }> {
        const name = entityName.trim()
        if (!name) return { ok: false, error: '实体名不能为空' }
        if (!canEdit) return { ok: false, error: '该条目已被管理员锁定，仅管理员可写入数据库' }
        const payload = buildSavePayload(list ? list.map(toBuffRow) : buffs)
        const savedCount = payload.filter((b) => b.zones.length > 0).length
        const res = await upsertBuffEntity({
            entityType,
            entityName: name,
            buffs: payload as Parameters<typeof upsertBuffEntity>[0]['buffs']
        })
        const error = (res as { error?: string } | undefined)?.error
        if (error) return { ok: false, error }
        toast(`AI 已直接写入 ${savedCount} 条 Buff`, 'success')
        router.refresh()
        return { ok: true, saved: savedCount }
    }

    function onDeleteEntity() {
        if (!entityName) return
        run(() => deleteBuffEntity(entityType, entityName)).then((ok) => {
            if (ok) {
                toast('已删除该实体', 'success')
                onEntityDeleted?.()
                router.refresh()
            }
        })
    }

    // ── AI ──
    // 把 AI 生成的 buffs 应用到列表（数字 → 字符串草稿）
    function toBuffRow(b: GeneratedBuff): BuffRow {
        return {
            buffName: b.buffName,
            scope: b.scope ?? 'team',
            exclusive: !!b.exclusive,
            condition: sanitizeCondition(b.condition, 'buff') ?? null,
            zones: (b.zones ?? []).map((z) => ({
                zoneId: z.zoneId,
                value: String(z.value),
                override: !!z.override,
                condition: sanitizeZoneCondition(z.condition) ?? null,
                ref: z.ref
                    ? {
                          targetZoneId: z.ref.targetZoneId,
                          pct: String(z.ref.pct),
                          ...(z.ref.threshold !== undefined ? { threshold: String(z.ref.threshold) } : {}),
                          ...(z.ref.lower !== undefined ? { lower: String(z.ref.lower) } : {}),
                          ...(z.ref.upper !== undefined ? { upper: String(z.ref.upper) } : {}),
                          ...(z.ref.discrete ? { discrete: true } : {}),
                          ...(z.ref.divisor !== undefined ? { divisor: String(z.ref.divisor) } : {}),
                          ...(z.ref.multiplier !== undefined ? { multiplier: String(z.ref.multiplier) } : {}),
                          ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                      }
                    : null
            }))
        }
    }

    // 整体替换：用 AI 结果替换整个列表
    function applyBuffList(list: GeneratedBuff[]) {
        setBuffs(list.map(toBuffRow))
        setActiveBuffIdx(0)
        setExpandedZoneIdx(null)
    }

    // 追加合并：同名覆盖（保持原位置），无同名则追加到末尾
    function mergeBuffList(list: GeneratedBuff[]) {
        setBuffs((prev) => {
            const idxMap = new Map<string, number>()
            prev.forEach((b, i) => idxMap.set(b.buffName.trim(), i))
            const next = [...prev]
            for (const b of list) {
                const name = b.buffName.trim()
                if (!name) continue
                if (idxMap.has(name)) {
                    next[idxMap.get(name)!] = toBuffRow(b)
                } else {
                    idxMap.set(name, next.length)
                    next.push(toBuffRow(b))
                }
            }
            return next
        })
    }

    /**
     * @desc 当前编辑中的 Buff 集 → AI 结构（数字从草稿字符串还原）。
     *
     * 两个用途：AI 面板「润色」的请求体，以及「应用 / 追加」写回列表时的同一口径
     * （写回走 `toBuffRow`，这里只负责反向序列化）。
     */
    function getCurrentBuffs(): GeneratedBuff[] {
        const zonePayload = (z: ZoneRow): GeneratedBuff['zones'][number] => ({
            zoneId: z.zoneId,
            value: Number(z.value) || 0,
            ...(sanitizeZoneCondition(z.condition) ? { condition: sanitizeZoneCondition(z.condition) } : {}),
            ...(z.ref
                ? {
                      ref: {
                          targetZoneId: z.ref.targetZoneId,
                          pct: Number(z.ref.pct) || 0,
                          ...(z.ref.threshold !== undefined && z.ref.threshold !== ''
                              ? { threshold: Number(z.ref.threshold) || 0 }
                              : {}),
                          ...(z.ref.lower !== undefined && z.ref.lower !== '' ? { lower: Number(z.ref.lower) || 0 } : {}),
                          ...(z.ref.upper !== undefined && z.ref.upper !== '' ? { upper: Number(z.ref.upper) || 0 } : {}),
                          ...(z.ref.discrete ? { discrete: true } : {}),
                          ...(z.ref.divisor !== undefined && z.ref.divisor !== ''
                              ? { divisor: Number(z.ref.divisor) || 0 }
                              : {}),
                          ...(z.ref.multiplier !== undefined && z.ref.multiplier !== ''
                              ? { multiplier: Number(z.ref.multiplier) || 0 }
                              : {}),
                          ...(z.ref.refOwner ? { refOwner: z.ref.refOwner } : {})
                      }
                  }
                : {}),
            ...(z.override ? { override: true } : {})
        })
        return buffs.map((b) => ({
            buffName: b.buffName,
            scope: b.scope,
            exclusive: !!b.exclusive,
            ...(sanitizeCondition(b.condition, 'buff') ? { condition: sanitizeCondition(b.condition, 'buff') } : {}),
            zones: b.zones.map(zonePayload)
        }))
    }

    /**
     * @desc AI 工具可读写的 Buff 草稿接口。
     *  改草稿的工具（改名 / 改细节 / 增删）直接落到编辑器列表上 —— 管理员看得见、也能继续手改；
     *  「直接写入数据库」走 `saveDraftDirect`（与保存按钮同一条服务端链路 + 管理员确认）。
     */
    const draftApi: BuffDraftApi = {
        get: getCurrentBuffs,
        // 保留当前选中项（AI 改的是同一条时不该把选择跳回第一条）
        set: (list) => {
            const keepName = activeBuff?.buffName?.trim()
            setBuffs(list.map(toBuffRow))
            const nextIdx = keepName ? list.findIndex((b) => b.buffName.trim() === keepName) : 0
            setActiveBuffIdx(nextIdx >= 0 ? nextIdx : 0)
            setExpandedZoneIdx(null)
        },
        save: saveDraftDirect
    }

    /** @desc 「添加乘区」面板是否展开（就在乘区列表下方，与手工编辑区捆绑） */
    const [zonesOpen, setZonesOpen] = useState(false)
    /**
     * @desc 右侧显示「手工编辑区」还是「AI 工作区」（互斥切换）。
     *  左侧 Buff 列表在宽屏常驻、窄屏收成顶部下拉，因此右侧始终是唯一的工作区。
     */
    const [rightView, setRightView] = useState<'edit' | 'ai'>('edit')

    return (
        <div className="flex h-full flex-col mg-card">
            {/* 实体信息头 */}
            <div className="flex items-center justify-between border-b border-(--card-border) px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="rounded-sm bg-(--accent) px-2 py-0.5 text-xs font-medium text-(--accent-fg)">
                        {BUFF_ENTITY_LABELS[entityType]}
                    </span>
                    <h2 className="mg-title truncate text-lg">{entityName}</h2>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-(--muted)">
                        <span className="mg-num">{buffs.length}</span> 条 Buff
                    </span>
                    <div className="flex overflow-hidden rounded-sm border border-(--card-border)">
                        {[
                            { key: 'edit' as const, label: '手工编辑', icon: 'mdi:pencil-outline' },
                            { key: 'ai' as const, label: 'AI 工作区', icon: 'mdi:robot-outline' }
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setRightView(tab.key)}
                                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] transition-colors ${
                                    rightView === tab.key
                                        ? 'bg-(--accent) text-(--accent-fg)'
                                        : 'text-(--muted) hover:text-(--fg)'
                                }`}
                            >
                                <Icon icon={tab.icon} className="size-3.5" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                    {onclose && (
                        <button
                            onClick={onclose}
                            className="rounded-sm p-1 text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg)"
                            title="关闭"
                        >
                            <Icon icon="mdi:close" className="size-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* 窄屏：左侧列表收起为「Buff 下拉」——条目切换始终可达（宽屏隐藏本行） */}
            <div className="buff-editor-mobile-picker shrink-0 items-center gap-1.5 border-b border-(--card-border) px-2 py-1.5">
                <Icon icon="mdi:format-list-bulleted" className="size-3.5 shrink-0 text-(--accent-text)" />
                <select
                    value={activeBuffIdx ?? ''}
                    onChange={(e) => {
                        setActiveBuffIdx(Number(e.target.value))
                        setExpandedZoneIdx(null)
                    }}
                    className="min-w-0 flex-1 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1 text-xs outline-none focus:border-(--accent)"
                >
                    {buffs.length === 0 && <option value="">（暂无 Buff）</option>}
                    {buffs.map((buff, idx) => (
                        <option key={idx} value={idx}>
                            {buff.buffName.trim() || '（未命名）'}
                        </option>
                    ))}
                </select>
                <button onClick={addBuff} className="toolbar-btn toolbar-btn-ghost shrink-0 px-1.5 py-1">
                    <Icon icon="mdi:plus" className="size-3.5" />
                    新增
                </button>
            </div>

            {/* 主体：左侧 Buff 列表（宽屏常驻）+ 右侧工作区（手工编辑 / AI 二选一） */}
            <div className="buff-editor-layout flex min-h-0 flex-1 overflow-hidden">

                {/* ① 左：Buff 列表 */}
                <div className="buff-editor-buff-list flex w-56 shrink-0 flex-col border-r border-(--card-border)">
                    <div className="flex shrink-0 items-center justify-between border-b border-(--card-border) px-3 py-2">
                        <span className="flex items-center gap-1.5">
                            <Icon icon="mdi:format-list-bulleted" className="size-3.5 shrink-0 text-(--accent-text)" />
                            <span className="mg-title text-xs">Buff 条目</span>
                            <span className="mg-num text-xs text-(--muted)">{buffs.length}</span>
                        </span>
                        <button onClick={addBuff} className="toolbar-btn toolbar-btn-ghost px-1.5 py-0.5">
                            <Icon icon="mdi:plus" className="size-3.5" />
                            新增
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                        {buffs.length === 0 ? (
                            <div className="py-6 text-center mg-note">暂无 Buff，点击上方新增</div>
                        ) : (
                            buffs.map((buff, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        setActiveBuffIdx(idx)
                                        setExpandedZoneIdx(null)
                                        // 选中条目即回到手工编辑区（在 AI 工作区里点条目也能继续改）
                                        setRightView('edit')
                                    }}
                                    className={`w-full rounded-sm px-2 py-1.5 text-left transition-colors ${
                                        idx === activeBuffIdx
                                            ? 'bg-(--accent) text-(--accent-fg)'
                                            : 'text-(--fg) hover:bg-(--card-hover)'
                                    }`}
                                >
                                    <span className="block truncate text-xs font-medium">
                                        {buff.buffName.trim() || '（未命名）'}
                                    </span>
                                    <span className="block truncate text-[10px] text-(--muted)">
                                        {buff.zones
                                            .map(
                                                (z) =>
                                                    `${BUFF_ZONE_MAP.get(z.zoneId)?.label ?? z.zoneId}+${
                                                        z.ref ? '引用' : z.value
                                                    }${zoneConditionBadge(z.condition) ? `[${zoneConditionBadge(z.condition)}]` : ''}`
                                            )
                                            .join(' · ') || '无乘区'}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* 右侧工作区：手工编辑（含乘区，捆绑在一起） 或 AI 工作区，二者互斥 */}
                {rightView === 'edit' ? (
                <div className="buff-editor-main flex min-w-0 flex-1 flex-col">
                    {activeBuff && activeBuffIdx !== null ? (
                        <>
                            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-(--card-border) px-3 py-2">
                                <input
                                    value={activeBuff.buffName}
                                    onChange={(e) => updateActiveBuff({ buffName: e.target.value })}
                                    placeholder="Buff 名"
                                    className="min-w-0 flex-1 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1 text-sm outline-none focus:border-(--accent)"
                                />
                                <div className="flex shrink-0 overflow-hidden rounded-sm border border-(--card-border)">
                                    {SCOPE_TABS.map((t) => (
                                        <button
                                            key={t.value}
                                            onClick={() => setBuffScope(t.value)}
                                            className={`px-2 py-1 text-[11px] transition-colors ${
                                                (activeBuff.scope ?? 'team') === t.value
                                                    ? 'bg-(--accent) text-(--accent-fg)'
                                                    : 'text-(--muted) hover:text-(--fg)'
                                            }`}
                                            title={BUFF_SCOPE_LABELS[t.value]}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={() => removeBuffAt(activeBuffIdx)}
                                    className="shrink-0 rounded-sm p-1 text-(--muted) transition-colors hover:text-(--danger)"
                                    title="删除该 Buff"
                                >
                                    <Icon icon="mdi:delete-outline" className="size-4" />
                                </button>
                            </div>

                            {/* 实例级生效条件（折叠面板：链 / 阶硬门槛，互斥；属性·类型挂在乘区上） */}
                            <div className="shrink-0 border-b border-(--card-border)">
                                <button
                                    onClick={() => setCondPanelOpen((v) => !v)}
                                    className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] transition-colors hover:bg-(--card-hover) ${
                                        conditionSummary ? 'text-(--accent-text)' : 'text-(--muted)'
                                    }`}
                                    title="链/阶条件（硬性门槛，链阶互斥）"
                                >
                                    <Icon
                                        icon={condPanelOpen ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                                        className="size-3.5 shrink-0 text-(--muted)"
                                    />
                                    <span className="shrink-0">链/阶条件</span>
                                    {conditionSummary && (
                                        <span className="min-w-0 truncate text-[11px]">：{conditionSummary}</span>
                                    )}
                                </button>
                                {condPanelOpen && (
                                    <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5">
                                        {canChain ? (
                                            <div className="flex items-center gap-2 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1">
                                                <span className="text-[11px] text-(--fg)">共鸣链</span>
                                                <div className="flex overflow-hidden rounded-sm border border-(--card-border)">
                                                    {Array.from({ length: CHAIN_MAX + 1 }, (_, k) => k).map((n) => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setBuffChain(n)}
                                                            title={n === 0 ? '本体（0链）' : `≥${n}链`}
                                                            className={`flex h-6 min-w-6 items-center justify-center px-1 text-[11px] transition-colors ${
                                                                chainMinOf(activeBuff.condition) === n
                                                                    ? 'bg-(--accent) text-(--accent-fg)'
                                                                    : 'text-(--muted) hover:text-(--fg)'
                                                            }`}
                                                        >
                                                            {n === 0 ? '本体' : n}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-(--muted)">
                                                {entityType === 'weapon'
                                                    ? '链条件只用于角色实体'
                                                    : '链/阶条件只用于角色 / 武器实体'}
                                            </span>
                                        )}
                                        {canRefinement && (
                                            <div className="flex items-center gap-2 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1">
                                                <span className="text-[11px] text-(--fg)">精炼</span>
                                                <div className="flex overflow-hidden rounded-sm border border-(--card-border)">
                                                    {Array.from({ length: REFINE_MAX }, (_, k) => k + 1).map((n) => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setBuffRefinement(n)}
                                                            title={`≥${n}阶`}
                                                            className={`flex h-6 min-w-6 items-center justify-center px-1 text-[11px] transition-colors ${
                                                                (activeBuff.condition?.refinements?.[0]?.min ??
                                                                    activeBuff.condition?.refinement) === n
                                                                    ? 'bg-(--accent) text-(--accent-fg)'
                                                                    : 'text-(--muted) hover:text-(--fg)'
                                                            }`}
                                                        >
                                                            {n}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            onClick={clearBuffCondition}
                                            className="flex h-6 items-center gap-1 rounded-sm border border-(--card-border) px-2 text-[10px] text-(--muted) transition-colors hover:border-(--danger) hover:text-(--danger)"
                                        >
                                            <Icon icon="mdi:close-circle-outline" className="size-3" />
                                            清除
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 乘区贡献条目列表（同一乘区可多条，各自带数值 / 引用 / 覆盖 / 乘区级条件） */}
                            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                                {activeZones.length === 0 ? (
                                    <div className="py-6 text-center mg-note">
                                        暂无乘区，点击右侧乘区清单添加
                                    </div>
                                ) : (
                                    activeZones.map((z, idx) => {
                                        const def = BUFF_ZONE_MAP.get(z.zoneId)
                                        const noRef = ZONE_NO_REF_IDS.has(z.zoneId)
                                        const noOverride = ZONE_NO_OVERRIDE_IDS.has(z.zoneId)
                                        const badge = zoneConditionBadge(z.condition)
                                        return (
                                            <div key={`${z.zoneId}-${idx}`} className="space-y-1">
                                                <div
                                                    className="flex items-center gap-1.5 rounded-sm px-2.5 py-1.5"
                                                    style={{ background: 'var(--input-bg)' }}
                                                >
                                                    <span className="shrink-0 truncate text-[11px]">
                                                        {def?.label ?? z.zoneId}
                                                    </span>
                                                    {badge && (
                                                        <span
                                                            className="shrink-0 max-w-32 truncate rounded-sm border border-transparent px-1.5 py-0.5 text-[10px]"
                                                            style={{
                                                                background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                                                                color: 'var(--accent-text)'
                                                            }}
                                                            title={`该乘区条件：${describeCondition(z.condition, slotNameFor(entityType))}`}
                                                        >
                                                            {badge}
                                                        </span>
                                                    )}
                                                    {z.override && (
                                                        <span
                                                            className="shrink-0 px-1 py-0.5 text-[10px] font-black"
                                                            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
                                                            title="覆盖优先于一切：该乘区的其它条目都不参与计算"
                                                        >
                                                            覆盖生效
                                                        </span>
                                                    )}
                                                    {z.ref && !noRef ? (
                                                        (() => {
                                                            const refDef = BUFF_REF_ZONE_MAP.get(z.ref!.targetZoneId)
                                                            const th = Number(z.ref!.threshold ?? 0)
                                                            const refOp = th < 0 ? '+' : '-'
                                                            const refTh = Math.abs(th)
                                                            const refS = simplifyPct(Number(z.ref!.pct))
                                                            const hasThreshold = th !== 0
                                                            const hasLower = z.ref!.lower !== undefined
                                                            const hasUpper = z.ref!.upper !== undefined
                                                            return (
                                                                <span
                                                                    className="min-w-0 flex-1 truncate text-right text-[10px] text-(--muted)"
                                                                    title={`引用: (${refDef?.label ?? '?'}${hasThreshold ? ` ${refOp} ${refTh}${refDef?.unit === '%' ? '%' : ''}` : ''}) ÷${refS.divisor}×${refS.multiplier}${hasLower || hasUpper ? ` clamp(${hasLower ? z.ref!.lower : ''} ~ ${hasUpper ? z.ref!.upper : ''})` : ''}`}
                                                                >
                                                                    引用: ({refDef?.label ?? '?'}
                                                                    {hasThreshold ? refOp + refTh + (refDef?.unit === '%' ? '%' : '') : ''}
                                                                    ) ÷<span className="mg-num">{refS.divisor}</span>×
                                                                    <span className="mg-num">{refS.multiplier}</span>
                                                                    {hasLower || hasUpper ? (
                                                                        <span className="text-(--muted)">
                                                                            ({hasLower ? z.ref!.lower : ''}~{hasUpper ? z.ref!.upper : ''})
                                                                        </span>
                                                                    ) : null}
                                                                </span>
                                                            )
                                                        })()
                                                    ) : (
                                                        <>
                                                            <input
                                                                type="number"
                                                                value={z.value}
                                                                onChange={(e) => patchZoneAt(idx, { value: e.target.value })}
                                                                className="w-16 rounded-sm border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-xs text-right outline-none focus:border-(--accent) mg-num"
                                                            />
                                                            <span className="w-3 text-[10px] text-(--muted)">
                                                                {def?.unit === '%' ? '%' : ''}
                                                            </span>
                                                        </>
                                                    )}
                                                    {!noOverride && (
                                                        <button
                                                            onClick={() => setZoneOverride(idx, !z.override)}
                                                            className={`shrink-0 rounded-sm border px-1.5 py-1 text-[10px] transition-colors ${
                                                                z.override
                                                                    ? 'border-(--accent) text-(--accent-text)'
                                                                    : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                            }`}
                                                            title="覆盖/追加"
                                                        >
                                                            {z.override ? '覆盖' : '追加'}
                                                        </button>
                                                    )}
                                                    {!noRef && (
                                                        <button
                                                            onClick={() => setRefTargetIdx(idx)}
                                                            className={`shrink-0 rounded-sm border px-1.5 py-1 text-[10px] transition-colors ${
                                                                z.ref
                                                                    ? 'border-(--accent) text-(--accent-text)'
                                                                    : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                            }`}
                                                            title={
                                                                z.ref
                                                                    ? `引${entityType === 'character' ? '自己' : '主人'} ${
                                                                          BUFF_REF_ZONE_MAP.get(z.ref.targetZoneId)?.label ??
                                                                          z.ref.targetZoneId
                                                                      } × ${z.ref.pct}%`
                                                                    : '引用某属性（如 当前攻击×N%）'
                                                            }
                                                        >
                                                            <Icon icon="mdi:link-variant" className="mr-0.5 size-3" />
                                                            {z.ref ? '已引用' : '引用'}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => toggleZoneCondition(idx)}
                                                        className={`shrink-0 rounded-sm border px-1.5 py-1 text-[10px] transition-colors ${
                                                            z.condition
                                                                ? 'border-(--accent) text-(--accent-text)'
                                                                : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                        }`}
                                                        title={
                                                            z.condition
                                                                ? `该乘区条件：${describeCondition(z.condition, slotNameFor(entityType))}`
                                                                : '为该乘区设置生效条件（伤害类型/属性）'
                                                        }
                                                    >
                                                        <Icon
                                                            icon={expandedZoneIdx === idx ? 'mdi:chevron-up' : 'mdi:filter-outline'}
                                                            className="mr-0.5 size-3"
                                                        />
                                                        条件
                                                    </button>
                                                    <button
                                                        onClick={() => removeZoneAt(idx)}
                                                        className="shrink-0 rounded-sm p-1 text-(--muted) transition-colors hover:text-(--danger)"
                                                        title="移除该乘区条目"
                                                    >
                                                        <Icon icon="mdi:close" className="size-3.5" />
                                                    </button>
                                                </div>

                                                {/* 乘区级生效条件（行内展开）：只允许伤害类型 / 伤害属性 */}
                                                {expandedZoneIdx === idx && (
                                                    <div className="space-y-1.5 border-t border-(--card-border) bg-(--card) px-2.5 py-2">
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <span className="w-14 shrink-0 text-[10px] text-(--muted)">
                                                                伤害类型
                                                            </span>
                                                            {BUFF_DAMAGE_TYPES.map((dt) => {
                                                                const on = (z.condition?.damageTypes ?? []).includes(dt)
                                                                return (
                                                                    <button
                                                                        key={dt}
                                                                        onClick={() => toggleZoneConditionDamageType(idx, dt)}
                                                                        title={dt}
                                                                        className={`rounded-sm border px-1.5 py-0.5 text-[10px] transition-colors ${
                                                                            on
                                                                                ? 'border-(--accent) bg-(--accent) text-(--accent-fg)'
                                                                                : 'border-(--card-border) text-(--muted) hover:text-(--fg)'
                                                                        }`}
                                                                    >
                                                                        {BUFF_DAMAGE_TYPE_SHORT[dt] ?? dt}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <span className="w-14 shrink-0 text-[10px] text-(--muted)">
                                                                伤害属性
                                                            </span>
                                                            {BUFF_ELEMENTS.map((el) => {
                                                                const on = (z.condition?.elements ?? []).includes(el)
                                                                return (
                                                                    <button
                                                                        key={el}
                                                                        onClick={() => toggleZoneConditionElement(idx, el)}
                                                                        className={`rounded-sm border px-1.5 py-0.5 text-[10px] transition-colors ${
                                                                            on
                                                                                ? 'border-(--accent) bg-(--accent) text-(--accent-fg)'
                                                                                : 'border-(--card-border) text-(--muted) hover:text-(--fg)'
                                                                        }`}
                                                                    >
                                                                        {el}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                        {!isConditionEmpty(z.condition) && (
                                                            <div className="flex justify-end">
                                                                <button
                                                                    onClick={() => patchZoneAt(idx, { condition: null })}
                                                                    className="text-[10px] text-(--muted) transition-colors hover:text-(--danger)"
                                                                >
                                                                    清空该乘区条件
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>

                            {/* 添加乘区：直接接在乘区列表下方（不再单独开一栏，保持「编辑一条 Buff」的连贯性） */}
                            <div className="shrink-0 border-t border-(--card-border)">
                                <button
                                    onClick={() => setZonesOpen((v) => !v)}
                                    className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-(--muted) transition-colors hover:bg-(--card-hover)"
                                    title="添加乘区贡献条目（同一乘区可多次添加）"
                                >
                                    <Icon
                                        icon={zonesOpen ? 'mdi:chevron-down' : 'mdi:playlist-plus'}
                                        className="size-3.5 shrink-0 text-(--accent-text)"
                                    />
                                    <span className="mg-title text-[11px]">添加乘区</span>
                                    <span className="ml-auto text-[10px]">同一乘区可多次添加</span>
                                </button>
                                {zonesOpen && (
                                    <div className="max-h-60 overflow-y-auto border-t border-(--card-border) p-2">
                                        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 xl:grid-cols-3">
                                            {BUFF_ZONE_SECTION_VIEWS.map((section) => (
                                                <div key={section.title} className="min-w-0">
                                                    <div className="px-1 pb-0.5 text-[10px] font-black tracking-[0.1em] text-(--muted)">
                                                        {section.title}
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        {section.defs.map((def) => {
                                                            const count = zoneCounts.get(def.id) ?? 0
                                                            return (
                                                                <button
                                                                    key={def.id}
                                                                    onClick={() => addZone(def.id)}
                                                                    title={`添加「${def.label}」${
                                                                        count > 0 ? `（已有 ${count} 条）` : ''
                                                                    }`}
                                                                    className={`flex w-full items-center gap-1 rounded-sm px-1.5 py-1 text-left text-[11px] transition-colors ${
                                                                        count > 0
                                                                            ? 'text-(--accent-text) hover:bg-(--card-hover)'
                                                                            : 'text-(--muted) hover:bg-(--card-hover) hover:text-(--fg)'
                                                                    }`}
                                                                >
                                                                    <Icon icon="mdi:plus" className="size-3 shrink-0" />
                                                                    <span className="min-w-0 flex-1 truncate">
                                                                        {def.label}
                                                                    </span>
                                                                    {count > 0 && (
                                                                        <span className="shrink-0 text-[10px]">
                                                                            {count}
                                                                        </span>
                                                                    )}
                                                                </button>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center text-xs text-(--muted)">
                            选择一条 Buff 开始编辑（或点「新增」）
                        </div>
                    )}
                </div>

                ) : (
                <BuffAiAssistant
                    variant="inline"
                    entityType={entityType}
                    entityName={entityName}
                    apiKey={apiKey}
                    aiBaseUrl={aiBaseUrl}
                    aiModel={aiModel}
                    aiDirect={aiDirect}
                    namingRule={namingRule}
                    systemPrompt={systemPrompt}
                    initialTaskPrompt={initialTaskPrompt}
                    toolPrompts={toolPrompts}
                    slangDict={slangDict}
                    reasoningEffort={reasoningEffort}
                    sessionSeed={sessionSeed}
                    onSessionUpdate={onSessionUpdate}
                    sessionShareEnabled={sessionShareEnabled}

                    draft={draftApi}
                    onApply={applyBuffList}
                    onMerge={mergeBuffList}
                />
                )}
            </div>

            {refTargetIdx !== null && (
                <BuffRefModal
                    open
                    entityType={entityType}
                    zoneId={refZone?.zoneId ?? ''}
                    initialRef={refZone?.ref ?? null}
                    onSave={saveRef}
                    onClose={() => setRefTargetIdx(null)}
                />
            )}

            {/* 底部固定操作条 */}
            <div className="shrink-0 border-t border-(--card-border) px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                    {isAdmin ? (
                        confirmDeleteEntity ? (
                            <button
                                onClick={onDeleteEntity}
                                disabled={pending}
                                className="rounded-sm border border-(--danger) bg-(--danger) transition-colors hover:bg-(--card) hover:text-(--danger) px-3 py-1.5 text-xs text-(--danger-fg)  disabled:opacity-50"
                            >
                                确认删除该实体全部 Buff
                            </button>
                        ) : (
                            <button
                                onClick={() => setConfirmDeleteEntity(true)}
                                onBlur={() => setTimeout(() => setConfirmDeleteEntity(false), 2000)}
                                className="toolbar-btn toolbar-btn-ghost text-(--danger) hover:text-(--danger)"
                            >
                                <Icon icon="mdi:trash-can-outline" className="size-3.5" />
                                删除实体
                            </button>
                        )
                    ) : (
                        <span className="toolbar-btn toolbar-btn-ghost text-(--muted) select-none">
                            <Icon icon={canEdit ? 'mdi:pencil-outline' : 'mdi:lock-outline'} className="size-3.5" />
                            {canEdit ? '编辑锁关闭中：保存即写入' : '该条目已被管理员锁定'}
                        </span>
                    )}
                    <button
                        onClick={onSave}
                        disabled={pending || !canSave || !canEdit}
                        title={!canEdit ? '该条目已被管理员锁定，仅管理员可保存' : undefined}
                        className="toolbar-btn toolbar-btn-primary"
                    >
                        <Icon
                            icon={pending ? 'mdi:loading' : 'mdi:check'}
                            className={pending ? 'size-4 animate-spin' : 'mr-1 inline size-4'}
                        />
                        {pending ? '保存中…' : '保存'}
                    </button>
                </div>
            </div>
        </div>
    )
}
