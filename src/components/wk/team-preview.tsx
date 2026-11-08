// 配队预览（新系统，服务端渲染）
// 与旧 TeamPreview 的差别：角色属性表由服务端传入，不再在客户端 fetch + 二次渲染
// （旧实现会在详情页闪一次色）；头像叠底沿用卡片的三条约束，不压字。
import { WkBadge, WkCard } from '@/design'
import { PHASE_LABELS } from '@/lib/types/project'
import type { CharSlot, PhaseKey } from '@/lib/types/project'

export default function TeamPreview({
    slots,
    locked,
    icons,
    elements
}: {
    slots: CharSlot[]
    locked: Record<PhaseKey, boolean>
    icons?: Record<string, string>
    elements?: Record<string, string>
}) {
    const lockedPhases = (Object.entries(locked) as [PhaseKey, boolean][])
        .filter(([, value]) => value)
        .map(([key]) => key)

    return (
        <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                {slots.map((slot, index) => {
                    const avatar = slot.character ? icons?.[slot.character] : undefined
                    const element = slot.character ? elements?.[slot.character] : undefined
                    const sets = slot.triggerSets.map((set) => `${set.name}×${set.pieces}`)
                    const echoes = slot.echoes.map((echo) => echo.name).filter((name): name is string => Boolean(name))

                    return (
                        <WkCard key={index} pad className="wk-pcard">
                            {avatar && (
                                <div className="wk-card-art" aria-hidden="true">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={avatar} alt="" loading="lazy" style={{ width: 96, height: 96 }} />
                                </div>
                            )}
                            <div className="wk-card-inner">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="wk-badge" aria-hidden="true">
                                        {index + 1}
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 'var(--wk-t-lead)',
                                            fontWeight: 600,
                                            color: element ? `var(--element-${element})` : 'var(--wk-fg)'
                                        }}
                                    >
                                        {slot.character ?? '未选择'}
                                    </span>
                                </div>

                                <dl style={{ display: 'grid', gap: 6, margin: 0, fontSize: 'var(--wk-t-meta)' }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                        <dt style={{ width: 32, flexShrink: 0, color: 'var(--wk-fg-3)' }}>武器</dt>
                                        <dd style={{ margin: 0, color: slot.weapon ? 'var(--wk-fg)' : 'var(--wk-fg-3)' }}>
                                            {slot.weapon ?? '未选择'}
                                        </dd>
                                    </div>
                                    {sets.length > 0 && (
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                            <dt style={{ width: 32, flexShrink: 0, color: 'var(--wk-fg-3)' }}>套装</dt>
                                            <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {sets.map((set) => (
                                                    <WkBadge key={set}>{set}</WkBadge>
                                                ))}
                                            </dd>
                                        </div>
                                    )}
                                    {echoes.length > 0 && (
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                            <dt style={{ width: 32, flexShrink: 0, color: 'var(--wk-fg-3)' }}>声骸</dt>
                                            <dd style={{ margin: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {echoes.map((name) => (
                                                    <WkBadge key={name}>{name}</WkBadge>
                                                ))}
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </div>
                        </WkCard>
                    )
                })}
            </div>

            <p className="wk-meta" style={{ paddingTop: 12, borderTop: '1px solid var(--wk-line)' }}>
                已锁定阶段：{lockedPhases.length > 0 ? lockedPhases.map((key) => PHASE_LABELS[key]).join(' · ') : '无'}
            </p>
        </div>
    )
}
