import { shortName } from '@/lib/utils/character'

interface Props {
    names: string[]
    size?: 'sm' | 'lg'
}

const PALETTE = ['#6366f1', '#38bdf8', '#34d399']

export default function TeamBanner({ names, size = 'sm' }: Props) {
    const slots = [0, 1, 2]
    return (
        <div className="flex flex-wrap items-center gap-2">
            {slots.map((i) => {
                const name = names[i]
                const color = PALETTE[i]
                if (!name) {
                    return (
                        <span
                            key={i}
                            className="rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted)"
                        >
                            空位
                        </span>
                    )
                }
                return (
                    <span
                        key={i}
                        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"
                        style={{ background: `${color}1f`, color, borderColor: `${color}4d` }}
                    >
                        <span
                            className={`flex size-5 shrink-0 items-center justify-center rounded-md font-semibold text-white ${
                                size === 'lg' ? 'size-6' : ''
                            }`}
                            style={{ background: color }}
                        >
                            {shortName(name)}
                        </span>
                        {name}
                    </span>
                )
            })}
        </div>
    )
}
