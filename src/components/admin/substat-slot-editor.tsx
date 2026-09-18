'use client'

// 标准词条集 · 单个声骸部位编辑器（cost 4/3/1 + 主词条 + 副主词条 + 最多 5 条副词条）。
// 与工具箱的声骸配置一一对应：cost 决定主词条可选池与副主词条固定值。

import { useState } from 'react'
import { Icon } from '@iconify/react'
import {
    ECHO_COSTS,
    MAIN_STAT_POOL,
    SECOND_MAIN_STAT_DEFAULT,
    STAT_UNITS,
    SUBSTAT_MAX_PER_SLOT,
    SUBSTAT_TYPES,
    defaultStatUnit
} from '@/lib/consts/echo-stats'
import type { EchoPlanSlot, EchoStatValue } from '@/lib/types/db'

interface Props {
    index: number
    slot: EchoPlanSlot
    onChange: (slot: EchoPlanSlot) => void
}

const SELECT_CLASS =
    'min-w-0 flex-1 rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2 py-1 text-xs outline-none transition-colors focus:border-(--accent)'
const INPUT_CLASS =
    'w-20 shrink-0 rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2 py-1 text-xs outline-none transition-colors focus:border-(--accent) disabled:opacity-50'
const UNIT_CLASS =
    'w-16 shrink-0 rounded-none border-2 border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-xs outline-none transition-colors focus:border-(--accent) disabled:opacity-50'

// 数值输入：保留本地草稿串，避免输入 "1." 时被 number 化回写打断
function NumberInput({
    value,
    disabled,
    onCommit,
    placeholder
}: {
    value: number
    disabled?: boolean
    onCommit: (value: number) => void
    placeholder?: string
}) {
    const [draft, setDraft] = useState(() => String(value))
    return (
        <input
            type="text"
            inputMode="decimal"
            value={draft}
            disabled={disabled}
            placeholder={placeholder ?? '数值'}
            onChange={(e) => {
                const next = e.target.value
                setDraft(next)
                const n = Number(next)
                if (next.trim() !== '' && Number.isFinite(n)) onCommit(n)
                else if (next.trim() === '') onCommit(0)
            }}
            onBlur={() => setDraft(String(value))}
            className={INPUT_CLASS}
        />
    )
}

interface StatEditorProps {
    label: string
    stat: EchoStatValue | null
    options: readonly string[]
    emptyLabel?: string
    hint?: string
    onChange: (stat: EchoStatValue | null) => void
}

// 单条词条行（主词条 / 副主词条共用）：type 下拉 + 数值 + 单位
function StatEditor({ label, stat, options, emptyLabel = '无', hint, onChange }: StatEditorProps) {
    // 允许保留池外的既有 type（例如切换 cost 后原主词条仍在白名单内）
    const shown = stat && !options.includes(stat.type) ? [stat.type, ...options] : options
    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-(--muted)">{label}</span>
                {hint && <span className="text-[10px] text-(--muted)">{hint}</span>}
            </div>
            <div className="flex items-center gap-1.5">
                <select
                    value={stat?.type ?? ''}
                    onChange={(e) => {
                        const type = e.target.value
                        if (!type) {
                            onChange(null)
                            return
                        }
                        onChange({ type, value: stat?.value ?? 0, unit: defaultStatUnit(type) })
                    }}
                    className={SELECT_CLASS}
                >
                    <option value="">{emptyLabel}</option>
                    {shown.map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </select>
                {stat ? (
                    <NumberInput value={stat.value} onCommit={(v) => onChange({ ...stat, value: v })} />
                ) : (
                    <input type="text" value="" disabled placeholder="—" className={INPUT_CLASS} readOnly />
                )}
                <select
                    value={stat?.unit ?? ''}
                    disabled={!stat}
                    onChange={(e) => {
                        if (!stat) return
                        onChange({ ...stat, unit: e.target.value as EchoStatValue['unit'] })
                    }}
                    className={UNIT_CLASS}
                    aria-label={`${label}单位`}
                >
                    {STAT_UNITS.map((u) => (
                        <option key={u || 'none'} value={u}>
                            {u === '' ? '无' : u}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    )
}

export default function SubstatSlotEditor({ index, slot, onChange }: Props) {
    const pool = MAIN_STAT_POOL[slot.cost] ?? []
    const usedTypes = new Set(slot.substats.map((s) => s.type))
    // 主词条提示：已选则显示该词条的满级上限，否则提示当前 cost 的可选项数
    const selectedMain = slot.mainStat ? pool.find((p) => p.type === slot.mainStat?.type) : undefined
    const mainHint = selectedMain
        ? `上限 ${selectedMain.maxValue}`
        : pool.length > 0
          ? `cost ${slot.cost} 可选 ${pool.length} 项`
          : undefined

    function updateSubstat(i: number, stat: EchoStatValue) {
        onChange({ ...slot, substats: slot.substats.map((s, idx) => (idx === i ? stat : s)) })
    }

    function removeSubstat(i: number) {
        onChange({ ...slot, substats: slot.substats.filter((_, idx) => idx !== i) })
    }

    function addSubstat() {
        const next = SUBSTAT_TYPES.find((t) => !usedTypes.has(t))
        if (!next) return
        onChange({ ...slot, substats: [...slot.substats, { type: next, value: 0, unit: defaultStatUnit(next) }] })
    }

    return (
        <div className="flex flex-col gap-3 rounded-none border-2 border-(--card-border) bg-(--card) p-3">
            {/* 部位头：序号 + cost 切换 */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-(--fg)">部位 {index + 1}</span>
                <div className="flex items-center gap-1 rounded-none border-2 border-(--card-border) bg-(--card-hover) p-0.5">
                    {ECHO_COSTS.map((c) => (
                        <button
                            key={c}
                            onClick={() =>
                                onChange({
                                    ...slot,
                                    cost: c,
                                    // cost 决定主词条池与副主词条固定值：切换后重置，避免留下不匹配组合
                                    mainStat: null,
                                    secondMainStat: SECOND_MAIN_STAT_DEFAULT[c]
                                        ? { ...SECOND_MAIN_STAT_DEFAULT[c] }
                                        : null
                                })
                            }
                            className={`rounded-none px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                slot.cost === c
                                    ? 'bg-(--accent) text-(--accent-fg)'
                                    : 'text-(--muted) hover:text-(--fg)'
                            }`}
                            title={`声骸 cost ${c}（切换会清空该部位主词条/副主词条）`}
                        >
                            cost {c}
                        </button>
                    ))}
                </div>
            </div>

            <StatEditor
                label="主词条"
                stat={slot.mainStat}
                options={pool.map((p) => p.type)}
                emptyLabel="无主词条"
                hint={mainHint}
                onChange={(mainStat) => onChange({ ...slot, mainStat })}
            />

            <StatEditor
                label="副主词条（固定值）"
                stat={slot.secondMainStat}
                options={['攻击', '生命']}
                emptyLabel="无"
                onChange={(secondMainStat) => onChange({ ...slot, secondMainStat })}
            />

            {/* 副词条 */}
            <div className="flex flex-col gap-2 border-t-2 border-(--card-border) pt-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-(--muted)">
                        副词条 {slot.substats.length}/{SUBSTAT_MAX_PER_SLOT}
                    </span>
                    <button
                        onClick={addSubstat}
                        disabled={slot.substats.length >= SUBSTAT_MAX_PER_SLOT}
                        className="inline-flex items-center gap-1 rounded-none border-2 border-(--card-border) bg-(--card-hover) px-2 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-40"
                    >
                        <Icon icon="mdi:plus" className="size-3" />
                        添加
                    </button>
                </div>

                {slot.substats.length === 0 && (
                    <p className="text-[11px] text-(--muted)">该部位暂无副词条（每部位 1-5 条）</p>
                )}

                {slot.substats.map((stat, i) => (
                    <div key={`${i}:${stat.type}`} className="flex items-center gap-1.5">
                        <select
                            value={stat.type}
                            onChange={(e) => {
                                const type = e.target.value
                                updateSubstat(i, { ...stat, type, unit: defaultStatUnit(type) })
                            }}
                            className={SELECT_CLASS}
                        >
                            {SUBSTAT_TYPES.filter((t) => t === stat.type || !usedTypes.has(t)).map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                        <NumberInput value={stat.value} onCommit={(v) => updateSubstat(i, { ...stat, value: v })} />
                        <select
                            value={stat.unit}
                            onChange={(e) =>
                                updateSubstat(i, { ...stat, unit: e.target.value as EchoStatValue['unit'] })
                            }
                            className={UNIT_CLASS}
                            aria-label={`副词条 ${i + 1} 单位`}
                        >
                            {STAT_UNITS.map((u) => (
                                <option key={u || 'none'} value={u}>
                                    {u === '' ? '无' : u}
                                </option>
                            ))}
                        </select>
                        <button
                            onClick={() => removeSubstat(i)}
                            className="shrink-0 p-1 text-(--muted) transition-colors hover:text-(--danger)"
                            aria-label={`删除第 ${i + 1} 条副词条`}
                        >
                            <Icon icon="mdi:close" className="size-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}
