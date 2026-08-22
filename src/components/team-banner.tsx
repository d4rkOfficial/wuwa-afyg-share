import { charElement } from '@/lib/data/char-elements'

interface Props {
    names: string[]
    size?: 'sm' | 'lg'
}

export default function TeamBanner({ names, size = 'sm' }: Props) {
    const slots = [0, 1, 2]
    return (
        <div className="flex flex-wrap items-center gap-2">
            {slots.map((i) => {
                const name = names[i]
                if (!name) {
                    return (
                        <span
                            key={i}
                            className="rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted)"
                        >
                            空位
                        </span>
                    )
                }
                const el = charElement(name)
                if (!el) {
                    return (
                        <span
                            key={i}
                            className="inline-flex items-center rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--fg)"
                        >
                            {name}
                        </span>
                    )
                }
                const elVar = `var(--element-${el})`
                return (
                    <span
                        key={i}
                        className={`inline-flex items-center rounded-none border-2 px-3 py-1.5 text-sm font-bold ${
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
