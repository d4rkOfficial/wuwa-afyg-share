'use client'

// 标准词条集 · 单个声骸部位编辑器（cost 4/3/1 自由组合 + 主词条 + 副主词条 + 最多 5 条副词条）。
// 编辑规则：
// - 主词条：只选类型，**数值固定取满级上限**（不可填写）；
// - 副主词条：**按 cost 自动推导**（4→攻击150 / 3→攻击100 / 1→生命2280，不可编辑）；
// - 副词条：类型 + **档位下拉选择**（不可自由填写数值），单位按类型自动；
// - cost：不强制 43311，5 个部位合计 ≤ 12 即可。

import { Icon } from '@iconify/react'
import {
    defaultStatUnit,
    ECHO_COSTS,
    MAIN_STAT_POOL,
    midSubstatValue,
    secondMainStatFor,
    SUBSTAT_ADD_ORDER,
    SUBSTAT_MAX_PER_SLOT,
    substatTiers
} from '@/lib/consts/echo-stats'
import type { EchoPlanSlot, EchoStatValue } from '@/lib/types/db'

interface Props {
    index: number
    slot: EchoPlanSlot
    onChange: (slot: EchoPlanSlot) => void
}

const SELECT_CLASS =
    'min-w-0 flex-1 rounded-none border border-(--card-border) bg-(--input-bg) px-2 py-1 text-xs outline-none transition-colors focus:border-(--accent)'
const READONLY_CLASS =
    'w-24 shrink-0 rounded-none border border-(--card-border) bg-(--card-hover) px-2 py-1 text-right text-xs tabular-nums text-(--muted)'

export default function SubstatSlotEditor({ index, slot, onChange }: Props) {
    const pool = MAIN_STAT_POOL[slot.cost] ?? []
    const usedTypes = new Set(slot.substats.map((s) => s.type))
    const selectedMain = slot.mainStat ? pool.find((p) => p.type === slot.mainStat?.type) : undefined
    const autoSecond = secondMainStatFor(slot.cost)

    function updateSubstat(i: number, stat: EchoStatValue) {
        onChange({ ...slot, substats: slot.substats.map((s, idx) => (idx === i ? stat : s)) })
    }

    function removeSubstat(i: number) {
        onChange({ ...slot, substats: slot.substats.filter((_, idx) => idx !== i) })
    }

    function addSubstat() {
        // 前两条先给暴击率、暴击伤害（其余按白名单顺序），避免每次添加都要手动挑
        const next = SUBSTAT_ADD_ORDER.find((t) => !usedTypes.has(t))
        if (!next) return
        onChange({
            ...slot,
            substats: [...slot.substats, { type: next, value: midSubstatValue(next), unit: defaultStatUnit(next) }]
        })
    }

    return (
        <div className="flex flex-col gap-3 rounded-none border border-(--card-border) bg-(--card) p-3">
            {/* 部位头：序号 + cost 切换（不限组合，合计 ≤ 12 由页面统一校验） */}
            <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-black tracking-tight text-(--fg)">
                    部位 {index + 1}
                    <span className="ml-1 text-[10px] font-normal text-(--muted)">cost {slot.cost}</span>
                </span>
                <div className="flex items-center gap-1 rounded-none border border-(--card-border) bg-(--card-hover) p-0.5">
                    {ECHO_COSTS.map((c) => (
                        <button
                            key={c}
                            onClick={() =>
                                onChange({
                                    ...slot,
                                    cost: c,
                                    // cost 决定主词条池与副主词条固定值：切换后重置主词条，副主词条自动重算
                                    mainStat: null,
                                    secondMainStat: secondMainStatFor(c)
                                })
                            }
                            className={`rounded-none px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                slot.cost === c
                                    ? 'bg-(--accent) text-(--accent-fg)'
                                    : 'text-(--muted) hover:text-(--fg)'
                            }`}
                            title={`声骸 cost ${c}（切换会按新 cost 重置主词条并自动推导副主词条）`}
                        >
                            cost {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* 主词条：只选类型，数值固定满级 */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-(--muted)">主词条</span>
                    <span className="text-[10px] text-(--muted)">
                        {selectedMain ? '数值固定为满级上限' : `cost ${slot.cost} 可选 ${pool.length} 项`}
                    </span>
                </div>
                <div className="flex items-center gap-1.5">
                    <select
                        value={slot.mainStat?.type ?? ''}
                        onChange={(e) => {
                            const type = e.target.value
                            if (!type) {
                                onChange({ ...slot, mainStat: null })
                                return
                            }
                            const max = pool.find((p) => p.type === type)?.maxValue ?? 0
                            onChange({ ...slot, mainStat: { type, value: max, unit: '%' } })
                        }}
                        className={SELECT_CLASS}
                    >
                        <option value="">无主词条</option>
                        {pool.map((p) => (
                            <option key={p.type} value={p.type}>
                                {p.type}（满级 {p.maxValue}%）
                            </option>
                        ))}
                    </select>
                    <span className={READONLY_CLASS}>{slot.mainStat ? `${slot.mainStat.value}%` : '—'}</span>
                </div>
            </div>

            {/* 副主词条：按 cost 自动推导，只读展示 */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-(--muted)">副主词条（自动）</span>
                    <span className="text-[10px] text-(--muted)">按 cost 自动推导，无需填写</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate rounded-none border border-(--card-border) bg-(--card-hover) px-2 py-1 text-xs text-(--muted)">
                        {autoSecond ? autoSecond.type : '—'}
                    </span>
                    <span className={READONLY_CLASS}>{autoSecond ? `+${autoSecond.value}` : '—'}</span>
                </div>
            </div>

            {/* 副词条：类型 + 档位选择 */}
            <div className="flex flex-col gap-2 border-t border-(--card-border) pt-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-(--muted)">
                        副词条 {slot.substats.length}/{SUBSTAT_MAX_PER_SLOT}
                    </span>
                    <button
                        onClick={addSubstat}
                        disabled={slot.substats.length >= SUBSTAT_MAX_PER_SLOT}
                        className="inline-flex items-center gap-1 rounded-none border border-(--card-border) bg-(--card-hover) px-2 py-0.5 text-[11px] text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-40"
                    >
                        <Icon icon="mdi:plus" className="size-3" />
                        添加
                    </button>
                </div>

                {slot.substats.length === 0 && (
                    <p className="text-[11px] text-(--muted)">该部位暂无副词条（每部位 1-5 条）</p>
                )}

                {slot.substats.map((stat, i) => {
                    const tiers = substatTiers(stat.type)
                    return (
                        <div key={`${i}:${stat.type}`} className="flex items-center gap-1.5">
                            <select
                                value={stat.type}
                                onChange={(e) => {
                                    const type = e.target.value
                                    updateSubstat(i, {
                                        ...stat,
                                        type,
                                        value: midSubstatValue(type),
                                        unit: defaultStatUnit(type)
                                    })
                                }}
                                className={SELECT_CLASS}
                            >
                                {SUBSTAT_ADD_ORDER.filter((t) => t === stat.type || !usedTypes.has(t)).map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={String(stat.value)}
                                onChange={(e) =>
                                    updateSubstat(i, { ...stat, value: Number(e.target.value) })
                                }
                                className="w-24 shrink-0 rounded-none border border-(--card-border) bg-(--input-bg) px-2 py-1 text-right text-xs tabular-nums outline-none transition-colors focus:border-(--accent)"
                                aria-label={`副词条 ${i + 1} 档位`}
                            >
                                {tiers.map((t) => (
                                    <option key={t} value={String(t)}>
                                        {t}
                                        {stat.unit === '%' ? '%' : ''}
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
                    )
                })}
            </div>
        </div>
    )
}
