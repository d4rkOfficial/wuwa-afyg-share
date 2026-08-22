'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { BUFF_REF_ZONES, BUFF_ZONE_MAP } from '@/lib/consts/buff-zones'
import SelectMenu from '@/components/ui/select-menu'
import type { BuffEntityType } from '@/lib/types/db'

// 引用草稿（字符串字段，与编辑器 ZoneRefRow 一致）
export interface RefDraft {
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

interface Props {
    open: boolean
    entityType: BuffEntityType
    zoneId: string
    initialRef: RefDraft | null
    onSave: (ref: RefDraft | null) => void
    onClose: () => void
}

function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b)
}

function simplifyPct(pct: number): { divisor: number; multiplier: number } {
    if (pct === 0) return { divisor: 1, multiplier: 0 }
    const num = Math.round(pct)
    const g = gcd(num, 100)
    return { divisor: 100 / g, multiplier: num / g }
}

export default function BuffRefModal({ open, entityType, zoneId, initialRef, onSave, onClose }: Props) {
    const [draft, setDraft] = useState<RefDraft>(() =>
        initialRef
            ? {
                  targetZoneId: initialRef.targetZoneId,
                  pct: initialRef.pct,
                  threshold: initialRef.threshold,
                  lower: initialRef.lower,
                  upper: initialRef.upper,
                  discrete: !!initialRef.discrete,
                  divisor: initialRef.divisor,
                  multiplier: initialRef.multiplier,
                  refOwner: initialRef.refOwner
              }
            : {
                  targetZoneId: 'baseAtk',
                  pct: '',
                  threshold: undefined,
                  lower: undefined,
                  upper: undefined,
                  discrete: false,
                  divisor: undefined,
                  multiplier: undefined,
                  refOwner: entityType === 'character' ? 'self' : 'owner'
              }
    )
    const [hasThreshold, setHasThreshold] = useState(initialRef?.threshold !== undefined)
    const [hasLower, setHasLower] = useState(initialRef?.lower !== undefined)
    const [hasUpper, setHasUpper] = useState(initialRef?.upper !== undefined)

    if (!open) return null

    const s = simplifyPct(parseFloat(draft.pct) || 0)
    const divisor = draft.divisor ?? String(s.divisor)
    const multiplier = draft.multiplier ?? String(s.multiplier)

    const targetDef = BUFF_REF_ZONES.find((r) => r.id === draft.targetZoneId)
    const zoneUnit = BUFF_ZONE_MAP.get(zoneId)?.unit === '%' ? '%' : '点'

    function set(patch: Partial<RefDraft>) {
        setDraft((d) => ({ ...d, ...patch }))
    }

    function confirm() {
        const d = parseFloat(divisor)
        const m = parseFloat(multiplier)
        const pct = d !== 0 && !isNaN(d) && !isNaN(m) ? (m / d) * 100 : 0
        const out: RefDraft = {
            targetZoneId: draft.targetZoneId,
            pct: String(pct),
            refOwner: entityType === 'character' ? 'self' : 'owner'
        }
        if (hasThreshold && draft.threshold !== undefined && draft.threshold !== '') out.threshold = draft.threshold
        if (hasLower && draft.lower !== undefined && draft.lower !== '') out.lower = draft.lower
        if (hasUpper && draft.upper !== undefined && draft.upper !== '') out.upper = draft.upper
        if (draft.discrete) out.discrete = true
        out.divisor = divisor
        out.multiplier = multiplier
        onSave(out)
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 " onClick={onClose} />
            <div className="relative flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-none border-2 border-(--card-border) bg-(--card) p-4 ">
                <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-(--fg)">引用配置</span>
                    <button onClick={onClose} className="rounded p-1 text-(--muted) hover:text-(--fg)">
                        <Icon icon="mdi:close" className="size-5" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                    {/* refOwner 说明（由实体类型决定） */}
                    <div className="rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2 text-[11px] text-(--muted)">
                        <Icon icon="mdi:information-outline" className="mr-1 inline size-3.5 text-(--muted)" />
                        {entityType === 'character'
                            ? '角色只能引用自身面板属性'
                            : '武器 / 声骸 / 套装引用其装备者（主人）面板属性'}
                    </div>

                    {/* 引用属性 */}
                    <div>
                        <div className="mb-1 text-[10px] text-(--muted)">引用属性</div>
                        <SelectMenu
                            value={draft.targetZoneId}
                            onChange={(v) => set({ targetZoneId: v })}
                            options={BUFF_REF_ZONES.filter((rz) => rz.id !== zoneId).map((rz) => ({
                                value: rz.id,
                                label: rz.label
                            }))}
                            ariaLabel="选择引用属性"
                        />
                    </div>

                    {/* 转换规则卡 */}
                    <div className="space-y-2.5 rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2.5">
                        <div className="text-xs text-(--fg)/80">{targetDef?.label ?? draft.targetZoneId}</div>
                        {/* 超过阈值部分 */}
                        <div className="flex items-center rounded-none border-2 border-(--card-border) overflow-hidden">
                            <button
                                onClick={() => setHasThreshold((v) => !v)}
                                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    hasThreshold ? 'bg-(--accent)/12 text-(--accent-text)' : 'text-(--muted)'
                                }`}
                            >
                                超过
                            </button>
                            <input
                                type="number"
                                value={draft.threshold ?? ''}
                                onChange={(e) => set({ threshold: e.target.value })}
                                disabled={!hasThreshold}
                                placeholder="0"
                                className="min-w-0 flex-1 border-x border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-center text-xs outline-none disabled:text-(--muted) tabular-nums"
                            />
                            <span className="px-2.5 text-[11px] text-(--muted)">
                                {targetDef?.unit === '%' ? '%' : '点'}
                            </span>
                        </div>
                        {/* 线性/离散 */}
                        <div className="flex rounded-none border-2 border-(--card-border) overflow-hidden">
                            <button
                                onClick={() => set({ discrete: false })}
                                className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                    !draft.discrete ? 'bg-(--accent)/12 text-(--accent-text)' : 'text-(--muted)'
                                }`}
                            >
                                线性地
                            </button>
                            <div className="w-px bg-(--card-border)" />
                            <button
                                onClick={() => set({ discrete: true })}
                                className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                    draft.discrete ? 'bg-(--accent)/12 text-(--accent-text)' : 'text-(--muted)'
                                }`}
                            >
                                离散地
                            </button>
                        </div>
                        {/* 每 X 转 Y */}
                        <div className="flex items-center rounded-none border-2 border-(--card-border) overflow-hidden">
                            <span className="px-2.5 py-1.5 text-[11px] text-(--muted)">每</span>
                            <input
                                type="number"
                                value={divisor}
                                onChange={(e) => set({ divisor: e.target.value })}
                                className="min-w-0 flex-1 border-x border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-center text-xs outline-none tabular-nums"
                            />
                            <span className="px-2.5 py-1.5 text-[11px] text-(--muted)">
                                {targetDef?.unit === '%' ? '%' : '点'}
                            </span>
                            <span className="px-2.5 py-1.5 text-[11px] text-(--muted)">转换为</span>
                            <input
                                type="number"
                                value={multiplier}
                                onChange={(e) => set({ multiplier: e.target.value })}
                                className="min-w-0 flex-1 bg-(--input-bg) px-2 py-1.5 text-center text-xs outline-none tabular-nums"
                            />
                            <span className="px-2.5 py-1.5 text-[11px] text-(--muted)">{zoneUnit}</span>
                        </div>
                        <div className="flex justify-end text-xs text-(--muted)">
                            的<span className="ml-1 font-medium text-(--accent-text)">本乘区</span>
                        </div>
                    </div>

                    {/* 上下限 */}
                    <div className="flex gap-2">
                        <div className="flex flex-1 items-center rounded-none border-2 border-(--card-border) overflow-hidden">
                            <button
                                onClick={() => setHasLower((v) => !v)}
                                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    hasLower ? 'bg-(--accent)/12 text-(--accent-text)' : 'text-(--muted)'
                                }`}
                            >
                                下限
                            </button>
                            <input
                                type="number"
                                value={draft.lower ?? ''}
                                onChange={(e) => set({ lower: e.target.value })}
                                disabled={!hasLower}
                                className="min-w-0 flex-1 border-x border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-center text-xs outline-none disabled:text-(--muted) tabular-nums"
                            />
                            <span className="px-2.5 py-1.5 text-[11px] text-(--muted)">{zoneUnit}</span>
                        </div>
                        <div className="flex flex-1 items-center rounded-none border-2 border-(--card-border) overflow-hidden">
                            <button
                                onClick={() => setHasUpper((v) => !v)}
                                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    hasUpper ? 'bg-(--accent)/12 text-(--accent-text)' : 'text-(--muted)'
                                }`}
                            >
                                上限
                            </button>
                            <input
                                type="number"
                                value={draft.upper ?? ''}
                                onChange={(e) => set({ upper: e.target.value })}
                                disabled={!hasUpper}
                                className="min-w-0 flex-1 border-x border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-center text-xs outline-none disabled:text-(--muted) tabular-nums"
                            />
                            <span className="px-2.5 text-[11px] text-(--muted)">{zoneUnit}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t-2 border-(--card-border) pt-3">
                    <button
                        onClick={() => onSave(null)}
                        className="rounded-none px-3 py-1.5 text-xs text-(--danger) transition-colors hover:bg-(--card-hover)"
                    >
                        清除引用
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="rounded-none px-3 py-1.5 text-xs text-(--muted) hover:bg-(--card-hover)">
                            取消
                        </button>
                        <button
                            onClick={confirm}
                            className="toolbar-btn toolbar-btn-primary rounded-none px-4 py-1.5 text-xs"
                        >
                            确认
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
