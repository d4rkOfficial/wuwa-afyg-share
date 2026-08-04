'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { BUFF_ZONES, BUFF_ZONE_MAP, BUFF_REF_ZONES, BUFF_SCOPES, BUFF_SCOPE_LABELS } from '@/lib/consts/buff-zones'
import type { BuffScope } from '@/lib/types/db'

interface ZoneRefRow {
    targetZoneId: string
    pct: string
    threshold?: string
    refOwner?: 'self' | 'owner'
}

interface ZoneRow {
    zoneId: string
    value: string
    override: boolean
    ref?: ZoneRefRow | null
}

export interface BuffEditDraft {
    buffName: string
    scope: BuffScope
    exclusive: boolean
    zones: ZoneRow[]
}

interface Props {
    open: boolean
    initial: BuffEditDraft | null
    onClose: () => void
    onSave: (draft: BuffEditDraft) => void
    onDelete?: () => void
}

export default function BuffEntryModal({ open, initial, onClose, onSave, onDelete }: Props) {
    // 父组件通过 key 重挂载本组件来重置草稿；挂载时用 initial 初始化
    const [draft, setDraft] = useState<BuffEditDraft>(() =>
        initial
            ? (JSON.parse(JSON.stringify(initial)) as BuffEditDraft)
            : { buffName: '', scope: 'team', exclusive: false, zones: [] }
    )

    if (!open) return null

    const zoneIds = new Set(draft.zones.map((z) => z.zoneId))

    function setBuffName(value: string) {
        setDraft((d) => ({ ...d, buffName: value }))
    }

    function setScope(scope: BuffScope) {
        setDraft((d) => ({ ...d, scope, exclusive: scope === 'effect_only' }))
    }

    function toggleAddZone(zoneId: string) {
        setDraft((d) => {
            if (d.zones.some((z) => z.zoneId === zoneId)) {
                return { ...d, zones: d.zones.filter((z) => z.zoneId !== zoneId) }
            }
            return { ...d, zones: [...d.zones, { zoneId, value: '', override: false, ref: null }] }
        })
    }

    function setZone(zoneId: string, patch: Partial<ZoneRow>) {
        setDraft((d) => ({ ...d, zones: d.zones.map((z) => (z.zoneId === zoneId ? { ...z, ...patch } : z)) }))
    }

    function toggleZoneRef(zoneId: string) {
        setDraft((d) => ({
            ...d,
            zones: d.zones.map((z) =>
                z.zoneId === zoneId
                    ? { ...z, ref: z.ref ? null : { targetZoneId: 'baseAtk', pct: '', threshold: undefined } }
                    : z
            )
        }))
    }
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-(--card-border) bg-(--card) p-4 shadow-2xl">
                {/* 头部 */}
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-(--fg)">编辑 Buff</span>
                    <button onClick={onClose} className="rounded p-1 text-(--muted) hover:text-(--fg)">
                        <Icon icon="mdi:close" className="size-5" />
                    </button>
                </div>

                {/* Buff 名 + scope */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input
                        value={draft.buffName}
                        onChange={(e) => setBuffName(e.target.value)}
                        placeholder="Buff 名"
                        maxLength={80}
                        autoFocus
                        className="min-w-0 flex-1 rounded-lg border border-(--card-border) bg-(--input-bg) px-2.5 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                    />
                    <div className="flex shrink-0 overflow-hidden rounded-lg border border-(--card-border)">
                        {BUFF_SCOPES.map((s) => (
                            <button
                                key={s}
                                onClick={() => setScope(s)}
                                className={`px-2 py-1 text-[10px] transition-colors ${
                                    draft.scope === s
                                        ? 'bg-(--accent)/15 text-(--accent-text)'
                                        : 'bg-(--input-bg) text-(--muted) hover:text-(--fg)'
                                }`}
                                title={BUFF_SCOPE_LABELS[s]}
                            >
                                {BUFF_SCOPE_LABELS[s]}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 乘区编辑主体 */}
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto md:flex-row">
                    <div className="shrink-0 md:w-44">
                        <div className="mb-1 text-[10px] text-(--muted)">乘区（点击添加/移除）</div>
                        <div className="grid grid-cols-2 gap-1 md:grid-cols-1">
                            {BUFF_ZONES.map((def) => {
                                const exists = zoneIds.has(def.id)
                                return (
                                    <button
                                        key={def.id}
                                        onClick={() => toggleAddZone(def.id)}
                                        className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] transition-colors ${
                                            exists
                                                ? 'bg-(--accent)/15 text-(--accent-text)'
                                                : 'text-(--muted) hover:bg-(--card-bg)'
                                        }`}
                                    >
                                        <Icon
                                            icon={exists ? 'mdi:check' : 'mdi:circle-outline'}
                                            className="size-3.5 shrink-0"
                                        />
                                        {def.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="min-w-0 flex-1 space-y-1.5">
                        {draft.zones.length === 0 ? (
                            <div className="py-4 text-center text-[11px] text-(--muted)">
                                暂无乘区，点击左侧乘区添加
                            </div>
                        ) : (
                            draft.zones.map((z) => {
                                const def = BUFF_ZONE_MAP.get(z.zoneId)
                                return (
                                    <div key={z.zoneId} className="rounded-lg bg-(--card-bg) px-3 py-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate text-[11px]">
                                                {def?.label ?? z.zoneId}
                                            </span>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <input
                                                    type="number"
                                                    value={z.value}
                                                    onChange={(e) => setZone(z.zoneId, { value: e.target.value })}
                                                    className="w-16 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-xs text-right outline-none focus:border-(--accent)/60 tabular-nums"
                                                />
                                                <span className="w-3 text-[10px] text-(--muted)">
                                                    {def?.unit === '%' ? '%' : ''}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => toggleZoneRef(z.zoneId)}
                                                className={`shrink-0 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                                                    z.ref
                                                        ? 'border-(--accent) text-(--accent-text)'
                                                        : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                }`}
                                                title="引用某属性（如 攻击白值×N%）"
                                            >
                                                {z.ref ? '引用' : '引用'}
                                            </button>
                                            <button
                                                onClick={() => setZone(z.zoneId, { override: !z.override })}
                                                className={`shrink-0 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                                                    z.override
                                                        ? 'border-(--accent) text-(--accent-text)'
                                                        : 'border-transparent text-(--muted) hover:text-(--fg)'
                                                }`}
                                                title="覆盖/追加"
                                            >
                                                {z.override ? '覆盖' : '追加'}
                                            </button>
                                            <button
                                                onClick={() => toggleAddZone(z.zoneId)}
                                                className="shrink-0 rounded p-1 text-(--muted) transition-colors hover:text-(--danger)"
                                                title="移除乘区"
                                            >
                                                <Icon icon="mdi:close" className="size-3.5" />
                                            </button>
                                        </div>
                                        {z.ref && (
                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-md bg-(--input-bg) px-2 py-1.5">
                                                <span className="text-[10px] text-(--muted)">引用归属</span>
                                                <select
                                                    value={z.ref.refOwner ?? 'self'}
                                                    onChange={(e) =>
                                                        setZone(z.zoneId, {
                                                            ref: { ...z.ref!, refOwner: e.target.value as 'self' | 'owner' }
                                                        })
                                                    }
                                                    className="rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-[11px] outline-none focus:border-(--accent)/60"
                                                    title="self=引自己（角色自身）；owner=引主人（武器/声骸/套装装备者）"
                                                >
                                                    <option value="self">引自己</option>
                                                    <option value="owner">引主人</option>
                                                </select>
                                                <span className="text-[10px] text-(--muted)">引用目标</span>
                                                <select
                                                    value={z.ref.targetZoneId}
                                                    onChange={(e) =>
                                                        setZone(z.zoneId, { ref: { ...z.ref!, targetZoneId: e.target.value } })
                                                    }
                                                    className="rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-[11px] outline-none focus:border-(--accent)/60"
                                                >
                                                    {BUFF_REF_ZONES.map((rz) => (
                                                        <option key={rz.id} value={rz.id}>
                                                            {rz.label}
                                                        </option>
                                                    ))}
                                                </select>
                                                <span className="text-[10px] text-(--muted)">百分比</span>
                                                <input
                                                    type="number"
                                                    value={z.ref.pct}
                                                    onChange={(e) =>
                                                        setZone(z.zoneId, { ref: { ...z.ref!, pct: e.target.value } })
                                                    }
                                                    placeholder="如 50"
                                                    className="w-16 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-[11px] outline-none focus:border-(--accent)/60"
                                                />
                                                <span className="text-[10px] text-(--muted)">阈值</span>
                                                <input
                                                    type="number"
                                                    value={z.ref.threshold ?? ''}
                                                    onChange={(e) =>
                                                        setZone(z.zoneId, { ref: { ...z.ref!, threshold: e.target.value } })
                                                    }
                                                    placeholder="可选"
                                                    className="w-16 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-[11px] outline-none focus:border-(--accent)/60"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* 底部操作 */}
                <div className="mt-3 flex flex-col gap-1.5 border-t border-(--card-border) pt-3">
                    <p className="text-[10px] text-(--muted)">
                        引用含义：引自己=引用该角色自身面板；引主人=引用装备该武器/声骸/套装的角色的面板。拉表导入时会按实体归属自动解析。
                    </p>
                    <div className="flex items-center justify-between">
                    {onDelete ? (
                        <button
                            onClick={onDelete}
                            className="toolbar-btn toolbar-btn-ghost text-(--danger) hover:text-(--danger) hover:bg-(--danger)/15"
                        >
                            <Icon icon="mdi:trash-can-outline" className="size-3.5" />
                            删除该 Buff
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="toolbar-btn toolbar-btn-ghost"
                        >
                            取消
                        </button>
                        <button
                            onClick={() => onSave(draft)}
                            className="toolbar-btn toolbar-btn-primary"
                            style={{ background: 'var(--btn-bg)' }}
                        >
                            <Icon icon="mdi:check" className="mr-1 inline size-4" />
                            保存
                        </button>
                    </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
