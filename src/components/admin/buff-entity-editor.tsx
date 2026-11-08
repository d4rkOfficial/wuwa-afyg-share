'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { upsertBuffEntity, deleteBuffEntity } from '@/lib/actions/buff-sets'
import { WkDropdown, wkToast } from '@/design'
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
import type { BuffEntityType, BuffFolderRow, BuffScope, BuffSetRow, BuffCondition } from '@/lib/types/db'
import { buffFolderName, buffLeafName, joinBuffPath } from '@/lib/buff-names'
import { Button, Input, Segmented } from '@/ui'
import BuffRefModal from '@/components/admin/buff-ref-modal'

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
        folders?: BuffFolderRow[]
    }

    isAdmin: boolean
    /** @desc 当前实体是否可编辑（编辑锁开着且该实体未被单独锁定；管理员恒为 true） */
    canEdit?: boolean
    onEntityDeleted?: () => void
    /** @desc 草稿脏状态变化（上层据此在 sidebar / 标签页上打未保存标记） */
    onDirtyChange?: (dirty: boolean) => void
    /** @desc 保存成功后回调（上层写进底部「输出」面板） */
    onSaved?: (count: number) => void
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


/** @desc DB 行 → 编辑器行（载入与「脏状态基线」共用同一份映射，避免两侧形状不一致） */
function toBuffRows(rows: BuffSetRow[]): BuffRow[] {
    return rows.map((r) => ({
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
}

export default function BuffEntityEditor({
    initial,

    isAdmin,
    canEdit = true,
    onEntityDeleted,
    onDirtyChange,
    onSaved
}: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [confirmDeleteEntity, setConfirmDeleteEntity] = useState(false)

    const entityType = initial.entityType
    const entityName = initial.entityName
    const [buffs, setBuffs] = useState<BuffRow[]>(() => toBuffRows(initial.buffs))

    const canSave = entityName.trim().length > 0

    /**
     * @desc 未保存判定：当前草稿 vs 载入时快照（两边都走 toBuffRows，形状一致）。
     *  用 JSON 全量比较，避免在几十处 mutation 里手工维护 dirty 标志。
     */
    const baselineSignature = useMemo(() => JSON.stringify(toBuffRows(initial.buffs)), [initial.buffs])
    const currentSignature = useMemo(() => JSON.stringify(buffs), [buffs])
    const dirty = canEdit && currentSignature !== baselineSignature
    useEffect(() => {
        onDirtyChange?.(dirty)
    }, [dirty, onDirtyChange])

    function run(fn: () => Promise<unknown>): Promise<boolean> {
        return new Promise((resolve) => {
            startTransition(async () => {
                const res = await fn()
                const r = res as { error?: string; data?: { saved?: number } } | undefined
                if (r?.error) {
                    wkToast(r.error, 'error')
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

    const folderNames = [
        ...new Set(buffs.map((buff) => buffFolderName(buff.buffName)).filter(Boolean))
    ]

    const buffsInFolder = (folder: string) =>
        buffs.map((buff, index) => ({ buff, index })).filter((item) => buffFolderName(item.buff.buffName) === folder)

    const rootBuffs = buffs
        .map((buff, index) => ({ buff, index }))
        .filter((item) => !buffFolderName(item.buff.buffName))

    function renderBuffRow(buff: BuffRow, idx: number) {
        const active = idx === activeBuffIdx
        return (
            <div
                key={idx}
                className={`flex items-center gap-1 rounded-sm px-1.5 py-1 transition-colors ${
                    active ? 'bg-(--wk-accent) text-(--wk-accent-fg)' : 'text-(--wk-fg) hover:bg-(--wk-s2)'
                }`}
            >
                <button
                    onClick={() => {
                        setActiveBuffIdx(idx)
                        setExpandedZoneIdx(null)
                    }}
                    className="min-w-0 flex-1 text-left"
                >
                    <span className="block truncate text-xs font-medium">
                        {buffLeafName(buff.buffName).trim() || '（未命名）'}
                    </span>
                    <span
                        className={`block truncate text-[10px] ${
                            active ? 'text-(--wk-accent-fg) opacity-80' : 'text-(--wk-fg-3)'
                        }`}
                    >
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
            </div>
        )
    }
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
            wkToast('请先选择实体名', 'error')
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
                wkToast(`已保存 ${savedCount} 条 Buff`, 'success')
                onSaved?.(savedCount)
            }
        })
    }


    function onDeleteEntity() {
        if (!entityName) return
        run(() => deleteBuffEntity(entityType, entityName)).then((ok) => {
            if (ok) {
                wkToast('已删除该实体', 'success')
                onEntityDeleted?.()
                router.refresh()
            }
        })
    }

    // ── AI ──
    // 把 AI 生成的 buffs 应用到列表（数字 → 字符串草稿）
        // 整体替换：用 AI 结果替换整个列表
        // 追加合并：同名覆盖（保持原位置），无同名则追加到末尾
        /**
     * @desc 当前编辑中的 Buff 集 → AI 结构（数字从草稿字符串还原）。
     *
     * 两个用途：AI 面板「润色」的请求体，以及「应用 / 追加」写回列表时的同一口径
     * （写回走 `toBuffRow`，这里只负责反向序列化）。
     */
        /**
     * @desc AI 工具可读写的 Buff 草稿接口。
     *  改草稿的工具（改名 / 改细节 / 增删）直接落到编辑器列表上 —— 管理员看得见、也能继续手改；
     *  「直接写入数据库」走 `saveDraftDirect`（与保存按钮同一条服务端链路 + 管理员确认）。
     */
    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* 实体信息头：只有信息，不放按钮（关闭走标签页的 ×，删除走底部操作条） */}
            <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-(--wk-line) px-4 py-2.5">
                <span className="shrink-0 rounded-sm bg-(--wk-accent) px-2 py-0.5 text-xs font-medium text-(--wk-accent-fg)">
                    {BUFF_ENTITY_LABELS[entityType]}
                </span>
                <h2 className="wk-title min-w-0 truncate text-base">{entityName}</h2>
                <span className="shrink-0 text-xs text-(--wk-fg-3)">
                    <span className="wk-numeral">{buffs.length}</span> 条 Buff
                </span>
            </div>

            {/* 窄屏：左侧列表收起为「Buff 切换」下拉——条目切换始终可达（宽屏隐藏本行） */}
            <div className="wk-editor-picker-mobile shrink-0 items-center gap-1.5 border-b border-(--wk-line) px-2 py-1.5">
                <Icon icon="mdi:format-list-bulleted" className="size-3.5 shrink-0 text-(--wk-accent-text)" />
                <div className="min-w-0 flex-1">
                    <WkDropdown
                        size="sm"
                        value={activeBuffIdx === null ? '' : String(activeBuffIdx)}
                        ariaLabel="切换 Buff 条目"
                        placeholder={buffs.length === 0 ? '（暂无 Buff）' : '切换 Buff 条目'}
                        onChange={(next) => {
                            setActiveBuffIdx(Number(next))
                            setExpandedZoneIdx(null)
                        }}
                        options={buffs.map((buff, idx) => ({
                            value: String(idx),
                            label: buffLeafName(buff.buffName).trim() || '（未命名）'
                        }))}
                    />
                </div>
                <Button size="sm" variant="ghost" onClick={addBuff} leading={<Icon icon="mdi:plus" className="size-3.5" />}>
                    新增
                </Button>
            </div>

            {/* 主体：左侧 Buff 列表（宽屏常驻）+ 右侧工作区（手工编辑 / AI 二选一） */}
            <div className="wk-editor-layout flex min-h-0 flex-1 overflow-hidden">

                {/* ① 左：Buff 列表 */}
                <div className="wk-editor-buff-list flex min-h-0 w-56 shrink-0 flex-col border-r border-(--wk-line)">
                    <div className="flex shrink-0 items-center justify-between border-b border-(--wk-line) px-3 py-2">
                        <span className="flex items-center gap-1.5">
                            <Icon icon="mdi:format-list-bulleted" className="size-3.5 shrink-0 text-(--wk-accent-text)" />
                            <span className="wk-title text-xs">Buff 条目</span>
                            <span className="wk-numeral text-xs text-(--wk-fg-3)">{buffs.length}</span>
                        </span>
                        <button onClick={addBuff} className="wk-btn wk-btn--ghost px-1.5 py-0.5">
                            <Icon icon="mdi:plus" className="size-3.5" />
                            新增
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
                        {buffs.length === 0 ? (
                            <div className="py-6 text-center wk-note">暂无 Buff，点击上方新增</div>
                        ) : (
                            <>
                                {folderNames.map((folder) => (
                                    <div key={folder} className="space-y-0.5">
                                        <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] font-bold text-(--wk-fg-3)">
                                            <Icon icon="mdi:folder-outline" className="size-3.5 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate">{folder}</span>
                                            <span className="shrink-0">{buffsInFolder(folder).length}</span>
                                        </div>
                                        {buffsInFolder(folder).map((item) => renderBuffRow(item.buff, item.index))}
                                    </div>
                                ))}
                                {rootBuffs.length > 0 && (
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] font-bold text-(--wk-fg-3)">
                                            <Icon icon="mdi:format-list-bulleted" className="size-3.5 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate">未归组</span>
                                            <span className="shrink-0">{rootBuffs.length}</span>
                                        </div>
                                        {rootBuffs.map((item) => renderBuffRow(item.buff, item.index))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* 右侧工作区：手工编辑 / AI 工作区都保持挂载，切换只隐藏，避免丢失聊天与编辑状态 */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <div className="wk-editor-main flex min-h-0 min-w-0 flex-1 flex-col">
                    {activeBuff && activeBuffIdx !== null ? (
                        <>
                            {/* 名称区：组名 + Buff 名 两个单行框（组名决定左侧分组，Buff 名决定条目显示） */}
                            <div className="shrink-0 space-y-2 border-b border-(--wk-line) px-3 py-2.5">
                                <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                                    <label className="wk-field">
                                        <span className="wk-field-label">组名</span>
                                        <Input
                                            value={buffFolderName(activeBuff.buffName)}
                                            placeholder="如 碎梦套（留空则不分组）"
                                            onChange={(e) =>
                                                updateActiveBuff({
                                                    buffName: joinBuffPath(
                                                        e.target.value,
                                                        buffLeafName(activeBuff.buffName) || '（未命名）'
                                                    )
                                                })
                                            }
                                        />
                                    </label>
                                    <label className="wk-field">
                                        <span className="wk-field-label">Buff 名</span>
                                        <Input
                                            value={buffLeafName(activeBuff.buffName)}
                                            placeholder="如 挂骇破 普攻/重击加成"
                                            onChange={(e) =>
                                                updateActiveBuff({
                                                    buffName: joinBuffPath(
                                                        buffFolderName(activeBuff.buffName),
                                                        e.target.value
                                                    )
                                                })
                                            }
                                        />
                                    </label>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Segmented
                                        ariaLabel="作用范围"
                                        value={activeBuff.scope ?? 'team'}
                                        onChange={(next) => setBuffScope(next)}
                                        options={SCOPE_TABS.map((t) => ({
                                            value: t.value,
                                            label: t.label,
                                            title: BUFF_SCOPE_LABELS[t.value]
                                        }))}
                                    />
                                    <div className="flex-1" />
                                    <Button
                                        variant="danger"
                                        onClick={() => activeBuffIdx !== null && removeBuffAt(activeBuffIdx)}
                                    >
                                        删除该条
                                    </Button>
                                </div>
                            </div>

                            {/* 实例级生效条件（折叠面板：链 / 阶硬门槛，互斥；属性·类型挂在乘区上） */}
                            <div className="shrink-0 border-b border-(--wk-line)">
                                <button
                                    onClick={() => setCondPanelOpen((v) => !v)}
                                    className={`flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] transition-colors hover:bg-(--wk-s2) ${
                                        conditionSummary ? 'text-(--wk-accent-text)' : 'text-(--wk-fg-3)'
                                    }`}
                                    title="链/阶条件（硬性门槛，链阶互斥）"
                                >
                                    <Icon
                                        icon={condPanelOpen ? 'mdi:chevron-down' : 'mdi:chevron-right'}
                                        className="size-3.5 shrink-0 text-(--wk-fg-3)"
                                    />
                                    <span className="shrink-0">链/阶条件</span>
                                    {conditionSummary && (
                                        <span className="min-w-0 truncate text-[11px]">：{conditionSummary}</span>
                                    )}
                                </button>
                                {condPanelOpen && (
                                    <div className="flex flex-wrap items-center gap-2 px-3 pb-2.5">
                                        {canChain ? (
                                            <div className="flex items-center gap-2 rounded-sm border border-(--wk-line) bg-(--wk-input) px-2 py-1">
                                                <span className="text-[11px] text-(--wk-fg)">共鸣链</span>
                                                <div className="flex overflow-hidden rounded-sm border border-(--wk-line)">
                                                    {Array.from({ length: CHAIN_MAX + 1 }, (_, k) => k).map((n) => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setBuffChain(n)}
                                                            title={n === 0 ? '本体（0链）' : `≥${n}链`}
                                                            className={`flex h-6 min-w-6 items-center justify-center px-1 text-[11px] transition-colors ${
                                                                chainMinOf(activeBuff.condition) === n
                                                                    ? 'bg-(--wk-accent) text-(--wk-accent-fg)'
                                                                    : 'text-(--wk-fg-3) hover:text-(--wk-fg)'
                                                            }`}
                                                        >
                                                            {n === 0 ? '本体' : n}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-(--wk-fg-3)">
                                                {entityType === 'weapon'
                                                    ? '链条件只用于角色实体'
                                                    : '链/阶条件只用于角色 / 武器实体'}
                                            </span>
                                        )}
                                        {canRefinement && (
                                            <div className="flex items-center gap-2 rounded-sm border border-(--wk-line) bg-(--wk-input) px-2 py-1">
                                                <span className="text-[11px] text-(--wk-fg)">精炼</span>
                                                <div className="flex overflow-hidden rounded-sm border border-(--wk-line)">
                                                    {Array.from({ length: REFINE_MAX }, (_, k) => k + 1).map((n) => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setBuffRefinement(n)}
                                                            title={`≥${n}阶`}
                                                            className={`flex h-6 min-w-6 items-center justify-center px-1 text-[11px] transition-colors ${
                                                                (activeBuff.condition?.refinements?.[0]?.min ??
                                                                    activeBuff.condition?.refinement) === n
                                                                    ? 'bg-(--wk-accent) text-(--wk-accent-fg)'
                                                                    : 'text-(--wk-fg-3) hover:text-(--wk-fg)'
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
                                            className="flex h-6 items-center gap-1 rounded-sm border border-(--wk-line) px-2 text-[10px] text-(--wk-fg-3) transition-colors hover:border-(--wk-danger) hover:text-(--wk-danger)"
                                        >
                                            <Icon icon="mdi:close-circle-outline" className="size-3" />
                                            清除
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* 主区：左 = 乘区条目，右 = 「添加乘区」栏（常驻，不再折叠） */}
                            <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                            {/* 乘区贡献条目列表（同一乘区可多条，各自带数值 / 引用 / 覆盖 / 乘区级条件） */}
                            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
                                {activeZones.length === 0 ? (
                                    <div className="py-6 text-center wk-note">
                                        暂无乘区，从右侧清单添加
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
                                                    style={{ background: 'var(--wk-input)' }}
                                                >
                                                    <span className="shrink-0 truncate text-[11px]">
                                                        {def?.label ?? z.zoneId}
                                                    </span>
                                                    {badge && (
                                                        <span
                                                            className="shrink-0 max-w-32 truncate rounded-sm border border-transparent px-1.5 py-0.5 text-[10px]"
                                                            style={{
                                                                background: 'color-mix(in srgb, var(--wk-accent) 18%, transparent)',
                                                                color: 'var(--wk-accent-text)'
                                                            }}
                                                            title={`该乘区条件：${describeCondition(z.condition, slotNameFor(entityType))}`}
                                                        >
                                                            {badge}
                                                        </span>
                                                    )}
                                                    {z.override && (
                                                        <span
                                                            className="shrink-0 px-1 py-0.5 text-[10px] font-black"
                                                            style={{ background: 'var(--wk-accent)', color: 'var(--wk-accent-fg)' }}
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
                                                                    className="min-w-0 flex-1 truncate text-right text-[10px] text-(--wk-fg-3)"
                                                                    title={`引用: (${refDef?.label ?? '?'}${hasThreshold ? ` ${refOp} ${refTh}${refDef?.unit === '%' ? '%' : ''}` : ''}) ÷${refS.divisor}×${refS.multiplier}${hasLower || hasUpper ? ` clamp(${hasLower ? z.ref!.lower : ''} ~ ${hasUpper ? z.ref!.upper : ''})` : ''}`}
                                                                >
                                                                    引用: ({refDef?.label ?? '?'}
                                                                    {hasThreshold ? refOp + refTh + (refDef?.unit === '%' ? '%' : '') : ''}
                                                                    ) ÷<span className="wk-numeral">{refS.divisor}</span>×
                                                                    <span className="wk-numeral">{refS.multiplier}</span>
                                                                    {hasLower || hasUpper ? (
                                                                        <span className="text-(--wk-fg-3)">
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
                                                                className="h-6 w-16 rounded-sm border border-(--wk-line) bg-(--wk-input) px-1.5 text-right text-xs outline-none focus:border-(--wk-accent) wk-numeral"
                                                            />
                                                            <span className="w-3 text-[10px] text-(--wk-fg-3)">
                                                                {def?.unit === '%' ? '%' : ''}
                                                            </span>
                                                        </>
                                                    )}
                                                    {!noOverride && (
                                                        <button
                                                            onClick={() => setZoneOverride(idx, !z.override)}
                                                            className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-[10px] leading-none transition-colors ${
                                                                z.override
                                                                    ? 'border-(--wk-accent) bg-(--wk-accent)/10 text-(--wk-accent-text)'
                                                                    : 'border-(--wk-ctrl-line) text-(--wk-fg-2) hover:border-(--wk-fg-3) hover:text-(--wk-fg)'
                                                            }`}
                                                            title={z.override ? '当前是「覆盖」：该乘区其它条目不参与计算' : '当前是「追加」：与其它条目相加'}
                                                        >
                                                            <Icon
                                                                icon={z.override ? 'mdi:check-circle-outline' : 'mdi:plus-circle-outline'}
                                                                className="size-3 shrink-0"
                                                            />
                                                            {z.override ? '覆盖' : '追加'}
                                                        </button>
                                                    )}
                                                    {!noRef && (
                                                        <button
                                                            onClick={() => setRefTargetIdx(idx)}
                                                            className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-[10px] leading-none transition-colors ${
                                                                z.ref
                                                                    ? 'border-(--wk-accent) bg-(--wk-accent)/10 text-(--wk-accent-text)'
                                                                    : 'border-(--wk-ctrl-line) text-(--wk-fg-2) hover:border-(--wk-fg-3) hover:text-(--wk-fg)'
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
                                                            <Icon icon="mdi:link-variant" className="size-3 shrink-0" />
                                                            {z.ref ? '已引用' : '引用'}
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => toggleZoneCondition(idx)}
                                                        className={`inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-[10px] leading-none transition-colors ${
                                                            z.condition
                                                                ? 'border-(--wk-accent) bg-(--wk-accent)/10 text-(--wk-accent-text)'
                                                                : 'border-(--wk-ctrl-line) text-(--wk-fg-2) hover:border-(--wk-fg-3) hover:text-(--wk-fg)'
                                                        }`}
                                                        title={
                                                            z.condition
                                                                ? `该乘区条件：${describeCondition(z.condition, slotNameFor(entityType))}`
                                                                : '为该乘区设置生效条件（伤害类型/属性）'
                                                        }
                                                    >
                                                        <Icon
                                                            icon={expandedZoneIdx === idx ? 'mdi:chevron-up' : 'mdi:filter-outline'}
                                                            className="size-3 shrink-0"
                                                        />
                                                        条件
                                                    </button>
                                                    <button
                                                        onClick={() => removeZoneAt(idx)}
                                                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-(--wk-fg-3) transition-colors hover:text-(--wk-danger)"
                                                        title="移除该乘区条目"
                                                    >
                                                        <Icon icon="mdi:close" className="size-3.5" />
                                                    </button>
                                                </div>

                                                {/* 乘区级生效条件（行内展开）：只允许伤害类型 / 伤害属性 */}
                                                {expandedZoneIdx === idx && (
                                                    <div className="space-y-1.5 border-t border-(--wk-line) bg-(--wk-s1) px-2.5 py-2">
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <span className="w-14 shrink-0 text-[10px] text-(--wk-fg-3)">
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
                                                                                ? 'border-(--wk-accent) bg-(--wk-accent) text-(--wk-accent-fg)'
                                                                                : 'border-(--wk-line) text-(--wk-fg-3) hover:text-(--wk-fg)'
                                                                        }`}
                                                                    >
                                                                        {BUFF_DAMAGE_TYPE_SHORT[dt] ?? dt}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-1">
                                                            <span className="w-14 shrink-0 text-[10px] text-(--wk-fg-3)">
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
                                                                                ? 'border-(--wk-accent) bg-(--wk-accent) text-(--wk-accent-fg)'
                                                                                : 'border-(--wk-line) text-(--wk-fg-3) hover:text-(--wk-fg)'
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
                                                                    className="text-[10px] text-(--wk-fg-3) transition-colors hover:text-(--wk-danger)"
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

                            {/* 添加乘区：右侧固定栏，一直可见（不再折叠、不再压在列表下方） */}
                            <aside className="min-h-0 w-full shrink-0 overflow-y-auto border-t border-(--wk-line) bg-(--wk-s2) p-2 md:w-60 md:border-t-0 md:border-l">
                                <div className="flex items-center gap-1.5 pb-1.5">
                                    <Icon icon="mdi:playlist-plus" className="size-3.5 shrink-0 text-(--wk-accent-text)" />
                                    <span className="wk-title text-[11px]">添加乘区</span>
                                </div>
                                <div className="space-y-1.5">
                                    {BUFF_ZONE_SECTION_VIEWS.map((section) => (
                                        <div key={section.title} className="min-w-0">
                                            <div className="px-1 pb-0.5 text-[10px] font-black tracking-[0.1em] text-(--wk-fg-3)">
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
                                                                    ? 'text-(--wk-accent-text) hover:bg-(--wk-s1)'
                                                                    : 'text-(--wk-fg-3) hover:bg-(--wk-s1) hover:text-(--wk-fg)'
                                                            }`}
                                                        >
                                                            <Icon icon="mdi:plus" className="size-3 shrink-0" />
                                                            <span className="min-w-0 flex-1 truncate">{def.label}</span>
                                                            {count > 0 && (
                                                                <span className="shrink-0 text-[10px]">{count}</span>
                                                            )}
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </aside>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center text-xs text-(--wk-fg-3)">
                            选择一条 Buff 开始编辑（或点「新增」）
                        </div>
                    )}
                </div>
                </div>

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

            {/* 底部操作条：左侧状态，右侧「删除实体」+「保存」。
                删除实体原来是藏在 ⋯ 菜单里的破坏性操作，这里改成常驻按钮 + 二次确认（不再有下拉菜单）。 */}
            <div className="shrink-0 border-t border-(--wk-line) px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-(--wk-fg-3)">
                        <Icon
                            icon={!canEdit ? 'mdi:lock-outline' : dirty ? 'mdi:circle-medium' : 'mdi:check-circle-outline'}
                            className={`size-3.5 ${dirty ? 'text-(--wk-accent-text)' : ''}`}
                        />
                        {!canEdit
                            ? '该条目已被管理员锁定'
                            : dirty
                              ? '有未保存改动'
                              : canSave
                                ? '已保存'
                                : '请输入实体名'}
                    </span>
                    <div className="flex-1" />
                    {isAdmin && (
                        <Button
                            variant="ghost"
                            disabled={pending}
                            onClick={() => {
                                if (!confirmDeleteEntity) {
                                    setConfirmDeleteEntity(true)
                                    return
                                }
                                setConfirmDeleteEntity(false)
                                onDeleteEntity()
                            }}
                            title="删除这个实体的全部 Buff（不可恢复）"
                        >
                            <Icon
                                icon={confirmDeleteEntity ? 'mdi:alert-outline' : 'mdi:trash-can-outline'}
                                className="mr-1 inline size-4"
                            />
                            {confirmDeleteEntity ? '确认删除整个实体' : '删除实体'}
                        </Button>
                    )}
                    <button
                        onClick={onSave}
                        disabled={pending || !canSave || !canEdit}
                        title={!canEdit ? '该条目已被管理员锁定，仅管理员可保存' : undefined}
                        className="wk-btn wk-btn--primary"
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
