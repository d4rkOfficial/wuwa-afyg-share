'use client'

// 标准词条集 · 单个声骸部位编辑器（cost 4/3/1 自由组合 + 主词条 + 副主词条 + 最多 5 条副词条）。
// 编辑规则：
// - 主词条：只选类型，**数值固定取满级上限**（不可填写）；
// - 副主词条：**按 cost 自动推导**（4→攻击150 / 3→攻击100 / 1→生命2280，不可编辑）；
// - 副词条：类型 + **档位选择**（不可自由填写数值），单位按类型自动；
// - cost：不强制 43311，5 个部位合计 ≤ 12 即可。
//
// 视觉：全部走设计系统（WkField / WkDropdown / WkSegmented / WkIconButton），
// 与 Buff 编辑台的字段同规格，不再用裸 select + 任意值 Tailwind 类。
import { Icon } from '@iconify/react'
import { WkDropdown, WkField, WkIconButton, WkSegmented } from '@/design'
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
    /** @desc 部位序号（0 起），仅用于标题 */
    index: number
    slot: EchoPlanSlot
    onChange: (slot: EchoPlanSlot) => void
}

export default function SubstatSlotEditor({ index, slot, onChange }: Props) {
    const pool = MAIN_STAT_POOL[slot.cost] ?? []
    const usedTypes = new Set(slot.substats.map((s) => s.type))
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
        <section className="wk-slot">
            <header className="wk-slot-head">
                <span className="wk-title" style={{ fontSize: 'var(--wk-t-body)' }}>
                    部位 {index + 1}
                </span>
                <WkSegmented<string>
                    value={String(slot.cost)}
                    ariaLabel="声骸 cost"
                    onChange={(next) =>
                        onChange({
                            ...slot,
                            cost: Number(next),
                            // cost 决定主词条池与副主词条固定值：切换后重置主词条，副主词条自动重算
                            mainStat: null,
                            secondMainStat: secondMainStatFor(Number(next))
                        })
                    }
                    options={ECHO_COSTS.map((cost) => ({ value: String(cost), label: `${cost}C` }))}
                />
            </header>

            <div className="wk-slot-body">
                <div className="wk-slot-grid">
                    <WkField label="主词条" hint={`cost ${slot.cost} 可选 ${pool.length} 项`}>
                        <WkDropdown
                            value={slot.mainStat?.type ?? ''}
                            ariaLabel="主词条"
                            placeholder="无主词条"
                            onChange={(type) => {
                                if (!type) {
                                    onChange({ ...slot, mainStat: null })
                                    return
                                }
                                const max = pool.find((p) => p.type === type)?.maxValue ?? 0
                                onChange({ ...slot, mainStat: { type, value: max, unit: '%' } })
                            }}
                            options={[
                                { value: '', label: '无主词条' },
                                ...pool.map((item) => ({
                                    value: item.type,
                                    label: `${item.type}（满级 ${item.maxValue}%）`
                                }))
                            ]}
                        />
                    </WkField>

                    <WkField label="主词条数值" hint="固定取满级上限，不可编辑">
                        <div className="wk-readonly">{slot.mainStat ? `${slot.mainStat.value}%` : '—'}</div>
                    </WkField>

                    <WkField label="副主词条" hint="按 cost 自动推导，无需填写">
                        <div className="wk-readonly">
                            {autoSecond ? `${autoSecond.type} +${autoSecond.value}` : '—'}
                        </div>
                    </WkField>
                </div>

                <div className="wk-slot-subs">
                    <div className="wk-slot-subs-head">
                        <span className="wk-label">
                            副词条 {slot.substats.length}/{SUBSTAT_MAX_PER_SLOT}
                        </span>
                        <button
                            type="button"
                            className="wk-btn wk-btn--sm"
                            onClick={addSubstat}
                            disabled={slot.substats.length >= SUBSTAT_MAX_PER_SLOT}
                        >
                            <Icon icon="mdi:plus" width={12} height={12} aria-hidden="true" />
                            添加副词条
                        </button>
                    </div>

                    {slot.substats.length === 0 && (
                        <p className="wk-meta">该部位暂无副词条（每个部位 1–5 条，整份方案共 14 条）</p>
                    )}

                    {slot.substats.map((stat, i) => (
                        <div key={`${i}:${stat.type}`} className="wk-slot-sub-row">
                            <WkDropdown
                                value={stat.type}
                                ariaLabel={`第 ${i + 1} 条副词条类型`}
                                onChange={(type) =>
                                    updateSubstat(i, {
                                        ...stat,
                                        type,
                                        value: midSubstatValue(type),
                                        unit: defaultStatUnit(type)
                                    })
                                }
                                options={SUBSTAT_ADD_ORDER.filter(
                                    (t) => t === stat.type || !usedTypes.has(t)
                                ).map((t) => ({ value: t, label: t }))}
                            />

                            <WkDropdown
                                value={String(stat.value)}
                                ariaLabel={`第 ${i + 1} 条副词条档位`}
                                onChange={(next) => updateSubstat(i, { ...stat, value: Number(next) })}
                                options={substatTiers(stat.type).map((tier) => ({
                                    value: String(tier),
                                    label: `${tier}${stat.unit === '%' ? '%' : ''}`
                                }))}
                            />

                            <WkIconButton
                                size="md"
                                variant="quiet"
                                label={`删除第 ${i + 1} 条副词条`}
                                onClick={() => removeSubstat(i)}
                            >
                                <Icon icon="mdi:close" width={14} height={14} aria-hidden="true" />
                            </WkIconButton>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
