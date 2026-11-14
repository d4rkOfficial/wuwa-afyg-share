'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { BUFF_REF_OWNER_OPTIONS, BUFF_REF_ZONES, BUFF_ZONE_MAP } from '@/lib/consts/buff-zones'
import SelectMenu from '@/components/ui/select-menu'
import type { BuffEntityType, BuffRefOwner } from '@/lib/types/db'

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
    refOwner?: BuffRefOwner
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

    /** @desc 归属两档：本角色（self/owner）/ 出伤者（active） */
    const ownerChoice: 'owner' | 'active' = draft.refOwner === 'active' ? 'active' : 'owner'
    const ownerHint = BUFF_REF_OWNER_OPTIONS.find((option) => option.value === ownerChoice)?.hint ?? ''
    const setOwner = (choice: 'owner' | 'active') =>
        set({ refOwner: choice === 'active' ? 'active' : entityType === 'character' ? 'self' : 'owner' })

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
            refOwner: ownerChoice === 'active' ? 'active' : entityType === 'character' ? 'self' : 'owner'
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
        /* 与「打开实体」同一套遮罩（--wk-scrim）：原来写的 bg-(--overlay) 是个不存在的令牌，
           等于没有遮罩，底下编辑区会透上来。 */
        <div
            className="wk wk-mask"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                className="wk-dialog"
                style={{ width: 'min(448px, 100%)' }}
                role="dialog"
                aria-modal="true"
                aria-label="引用配置"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-(--wk-line) px-4 py-3">
                    <span className="flex items-center gap-2 wk-title text-sm">
                        <Icon icon="mdi:link-variant" className="size-4 shrink-0 text-(--wk-accent-text)" />
                        引用配置
                    </span>
                    <button onClick={onClose} className="rounded-sm p-1 text-(--wk-fg-3) hover:text-(--wk-fg)">
                        <Icon icon="mdi:close" className="size-5" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
                    {/* 引用归属：本角色 / 出伤者（导入工具箱后分别落到实体归属槽位 / -1） */}
                    <div>
                        <div className="mb-1 text-[10px] text-(--wk-fg-3)">引用谁的属性</div>
                        <div className="flex overflow-hidden rounded-sm border border-(--wk-line)">
                            {BUFF_REF_OWNER_OPTIONS.map((option, index) => (
                                <div key={option.value} className="flex flex-1">
                                    {index > 0 && <div className="w-px bg-(--wk-line)" />}
                                    <button
                                        onClick={() => setOwner(option.value)}
                                        className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                            ownerChoice === option.value
                                                ? 'bg-(--wk-accent)/12 text-(--wk-accent-text)'
                                                : 'text-(--wk-fg-3)'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-1 text-[10px] text-(--wk-fg-3)">{ownerHint}</div>
                    </div>

                    {/* 引用属性 */}
                    <div>
                        <div className="mb-1 text-[10px] text-(--wk-fg-3)">引用属性</div>
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
                    <div className="space-y-2.5 rounded-sm border border-(--wk-line) bg-(--wk-input) px-3 py-2.5">
                        <div className="text-xs text-(--wk-fg)/80">{targetDef?.label ?? draft.targetZoneId}</div>
                        {/* 超过阈值部分 */}
                        <div className="flex items-center rounded-sm border border-(--wk-line) overflow-hidden">
                            <button
                                onClick={() => setHasThreshold((v) => !v)}
                                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    hasThreshold ? 'bg-(--wk-accent)/12 text-(--wk-accent-text)' : 'text-(--wk-fg-3)'
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
                                className="min-w-0 flex-1 border-x border-(--wk-line) bg-(--wk-input) px-2 py-1.5 text-center text-xs outline-none disabled:text-(--wk-fg-3) wk-numeral"
                            />
                            <span className="px-2.5 text-[11px] text-(--wk-fg-3)">
                                {targetDef?.unit === '%' ? '%' : '点'}
                            </span>
                        </div>
                        {/* 线性/离散 */}
                        <div className="flex rounded-sm border border-(--wk-line) overflow-hidden">
                            <button
                                onClick={() => set({ discrete: false })}
                                className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                    !draft.discrete ? 'bg-(--wk-accent)/12 text-(--wk-accent-text)' : 'text-(--wk-fg-3)'
                                }`}
                            >
                                线性地
                            </button>
                            <div className="w-px bg-(--wk-line)" />
                            <button
                                onClick={() => set({ discrete: true })}
                                className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                    draft.discrete ? 'bg-(--wk-accent)/12 text-(--wk-accent-text)' : 'text-(--wk-fg-3)'
                                }`}
                            >
                                离散地
                            </button>
                        </div>
                        {/* 每 X 转 Y */}
                        <div className="flex items-center rounded-sm border border-(--wk-line) overflow-hidden">
                            <span className="px-2.5 py-1.5 text-[11px] text-(--wk-fg-3)">每</span>
                            <input
                                type="number"
                                value={divisor}
                                onChange={(e) => set({ divisor: e.target.value })}
                                className="min-w-0 flex-1 border-x border-(--wk-line) bg-(--wk-input) px-2 py-1.5 text-center text-xs outline-none wk-numeral"
                            />
                            <span className="px-2.5 py-1.5 text-[11px] text-(--wk-fg-3)">
                                {targetDef?.unit === '%' ? '%' : '点'}
                            </span>
                            <span className="px-2.5 py-1.5 text-[11px] text-(--wk-fg-3)">转换为</span>
                            <input
                                type="number"
                                value={multiplier}
                                onChange={(e) => set({ multiplier: e.target.value })}
                                className="min-w-0 flex-1 bg-(--wk-input) px-2 py-1.5 text-center text-xs outline-none wk-numeral"
                            />
                            <span className="px-2.5 py-1.5 text-[11px] text-(--wk-fg-3)">{zoneUnit}</span>
                        </div>
                        <div className="flex justify-end text-xs text-(--wk-fg-3)">
                            的<span className="ml-1 font-medium text-(--wk-accent-text)">本乘区</span>
                        </div>
                    </div>

                    {/* 上下限 */}
                    <div className="flex gap-2">
                        <div className="flex flex-1 items-center rounded-sm border border-(--wk-line) overflow-hidden">
                            <button
                                onClick={() => setHasLower((v) => !v)}
                                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    hasLower ? 'bg-(--wk-accent)/12 text-(--wk-accent-text)' : 'text-(--wk-fg-3)'
                                }`}
                            >
                                下限
                            </button>
                            <input
                                type="number"
                                value={draft.lower ?? ''}
                                onChange={(e) => set({ lower: e.target.value })}
                                disabled={!hasLower}
                                className="min-w-0 flex-1 border-x border-(--wk-line) bg-(--wk-input) px-2 py-1.5 text-center text-xs outline-none disabled:text-(--wk-fg-3) wk-numeral"
                            />
                            <span className="px-2.5 py-1.5 text-[11px] text-(--wk-fg-3)">{zoneUnit}</span>
                        </div>
                        <div className="flex flex-1 items-center rounded-sm border border-(--wk-line) overflow-hidden">
                            <button
                                onClick={() => setHasUpper((v) => !v)}
                                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                                    hasUpper ? 'bg-(--wk-accent)/12 text-(--wk-accent-text)' : 'text-(--wk-fg-3)'
                                }`}
                            >
                                上限
                            </button>
                            <input
                                type="number"
                                value={draft.upper ?? ''}
                                onChange={(e) => set({ upper: e.target.value })}
                                disabled={!hasUpper}
                                className="min-w-0 flex-1 border-x border-(--wk-line) bg-(--wk-input) px-2 py-1.5 text-center text-xs outline-none disabled:text-(--wk-fg-3) wk-numeral"
                            />
                            <span className="px-2.5 text-[11px] text-(--wk-fg-3)">{zoneUnit}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-(--wk-line) px-4 py-3">
                    <button
                        onClick={() => onSave(null)}
                        className="rounded-sm px-3 py-1.5 text-xs text-(--wk-danger) transition-colors hover:bg-(--wk-s2)"
                    >
                        清除引用
                    </button>
                    <div className="flex items-center gap-2">
                        <button onClick={onClose} className="rounded-sm px-3 py-1.5 text-xs text-(--wk-fg-3) hover:bg-(--wk-s2)">
                            取消
                        </button>
                        <button
                            onClick={confirm}
                            className="wk-btn wk-btn--primary rounded-sm px-4 py-1.5 text-xs"
                        >
                            确认
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
