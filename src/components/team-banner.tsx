'use client'

import { useEffect, useState } from 'react'
import { charElement } from '@/lib/data/char-elements'

interface Props {
    names: string[]
    size?: 'sm' | 'lg'
}

export default function TeamBanner({ names, size = 'sm' }: Props) {
    const slots = [0, 1, 2]
    const [elements, setElements] = useState<Record<string, string>>({})
    const namesKey = names.join('|')

    useEffect(() => {
        let active = true
        const currentNames = namesKey.split('|').filter(Boolean)
        Promise.all(currentNames.map(async (name) => [name, await charElement(name)] as const)).then((entries) => {
            if (active) setElements(Object.fromEntries(entries))
        })
        return () => {
            active = false
        }
    }, [namesKey])

    return (
        <div className="flex flex-wrap items-center gap-2">
            {slots.map((i) => {
                const name = names[i]
                if (!name) {
                    return (
                        <span
                            key={i}
                            className="rounded-none border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted)"
                        >
                            空位
                        </span>
                    )
                }
                const el = elements[name] ?? ''
                if (!el) {
                    return (
                        <span
                            key={i}
                            className="inline-flex items-center rounded-none border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--fg)"
                        >
                            {name}
                        </span>
                    )
                }
                const elVar = `var(--element-${el})`
                return (
                    <span
                        key={i}
                        className={`inline-flex items-center rounded-none border px-3 py-1.5 text-sm font-black tracking-tight ${
                            size === 'lg' ? 'px-4 py-2 text-base' : ''
                        }`}
                        style={{
                            background: elVar,
                            color: '#000000',
                            borderColor: elVar
                        }}
                    >
                        {name}
                    </span>
                )
            })}
        </div>
    )
}
