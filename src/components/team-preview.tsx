'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import type { CharSlot, PhaseKey } from '@/lib/types/project'
import { PHASE_LABELS } from '@/lib/types/project'
import { charElement } from '@/lib/data/char-elements'

interface Props {
    slots: CharSlot[]
    locked: Record<PhaseKey, boolean>
    /** @desc 角色名 → 头像地址（与首页工程卡同源），用于卡片右下角头像叠底 */
    icons?: Record<string, string>
}

export default function TeamPreview({ slots, locked, icons }: Props) {
    const [elements, setElements] = useState<Record<string, string>>({})
    const characterNames = slots.map((slot) => slot.character).filter((name): name is string => Boolean(name))
    const characterNamesKey = characterNames.join('|')

    useEffect(() => {
        let active = true
        const currentNames = characterNamesKey.split('|').filter(Boolean)
        Promise.all(currentNames.map(async (name) => [name, await charElement(name)] as const)).then((entries) => {
            if (active) setElements(Object.fromEntries(entries))
        })
        return () => {
            active = false
        }
    }, [characterNamesKey])

    const lockedPhases = (Object.entries(locked) as [PhaseKey, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k)

    return (
        <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
                {slots.map((slot, i) => {
                    const echoNames = slot.echoes
                        .map((e) => e.name)
                        .filter((n): n is string => Boolean(n))
                    const sets = slot.triggerSets.map((s) => `${s.name}×${s.pieces}`)
                    const avatar = slot.character ? icons?.[slot.character] : undefined
                    return (
                        <div key={i} className="mg-card relative overflow-hidden p-4">
                            {/* 角色头像叠底（右下角，与首页工程卡同款遮罩） */}
                            {avatar && (
                                <div
                                    className="pointer-events-none absolute -bottom-2 -right-2 z-0 size-24 opacity-40"
                                    style={{
                                        WebkitMaskImage:
                                            'linear-gradient(to left, transparent, #000 40%), linear-gradient(to bottom, transparent, #000 40%)',
                                        WebkitMaskComposite: 'source-in',
                                        maskImage:
                                            'linear-gradient(to left, transparent, #000 40%), linear-gradient(to bottom, transparent, #000 40%)',
                                        maskComposite: 'intersect'
                                    }}
                                >
                                    <img src={avatar} alt="" className="size-full object-cover" />
                                </div>
                            )}
                            <div className="mg-section relative z-10">
                                <span className="mg-num flex size-7 shrink-0 items-center justify-center rounded-none border border-(--card-border) bg-(--card-hover) text-xs text-(--muted)">
                                    {i + 1}
                                </span>
                                {slot.character ? (
                                    <span
                                        className="mg-title text-sm"
                                        style={
                                            elements[slot.character]
                                                ? { color: `var(--element-${elements[slot.character]})` }
                                                : undefined
                                        }
                                    >
                                        {slot.character}
                                    </span>
                                ) : (
                                    <span className="mg-note">未选择</span>
                                )}
                            </div>

                            <dl className="space-y-2 text-sm">
                                <div className="flex items-start gap-2">
                                    <dt className="w-12 shrink-0 text-(--muted)">武器</dt>
                                    <dd className={slot.weapon ? '' : 'text-(--muted)'}>{slot.weapon ?? '未选择'}</dd>
                                </div>
                                {sets.length > 0 && (
                                    <div className="flex items-start gap-2">
                                        <dt className="w-12 shrink-0 text-(--muted)">套装</dt>
                                        <dd className="flex flex-wrap gap-1">
                                            {sets.map((s) => (
                                                <span
                                                    key={s}
                                                    className="mg-num rounded-none border border-(--card-border) bg-(--card-hover) px-1.5 py-0.5 text-xs"
                                                >
                                                    {s}
                                                </span>
                                            ))}
                                        </dd>
                                    </div>
                                )}
                                {echoNames.length > 0 && (
                                    <div className="flex items-start gap-2">
                                        <dt className="w-12 shrink-0 text-(--muted)">声骸</dt>
                                        <dd className="flex flex-wrap gap-1">
                                            {echoNames.map((name) => (
                                                <span
                                                    key={name}
                                                    className="rounded-none border border-(--card-border) bg-(--card-hover) px-1.5 py-0.5 text-xs"
                                                >
                                                    {name}
                                                </span>
                                            ))}
                                        </dd>
                                    </div>
                                )}
                            </dl>
                        </div>
                    )
                })}
            </div>

            <div className="flex items-center gap-2 border-t pt-3 text-xs leading-relaxed text-(--muted) mg-hairline">
                <Icon icon="mdi:lock-outline" className="size-4 shrink-0" />
                已锁定阶段：
                {lockedPhases.length > 0 ? lockedPhases.map((k) => PHASE_LABELS[k]).join(' · ') : '无'}
            </div>
        </div>
    )
}
