// 队伍 Badge：三个角色位各一枚「头像 + 角色名」小徽章（我的工程列表用）。
// 缺失的位置显示「空位」；没有头像时降级成中性人物图标。
import { Icon } from '@iconify/react'

interface Props {
    /** @desc 三个角色位的角色名（缺位可短于 3 个） */
    names: string[]
    /** @desc 角色名 → 头像地址 */
    icons?: Record<string, string>
    className?: string
}

const SLOTS = [0, 1, 2]

export default function TeamBadges({ names, icons, className = '' }: Props) {
    if (names.length === 0) return null

    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
            {SLOTS.map((i) => {
                const name = names[i]
                if (!name) {
                    return (
                        <span
                            key={i}
                            className="rounded-sm border border-dashed border-(--card-border) px-1.5 py-0.5 text-[11px] text-(--muted)"
                        >
                            空位
                        </span>
                    )
                }
                const avatar = icons?.[name]
                return (
                    <span
                        key={i}
                        title={name}
                        className="inline-flex min-w-0 max-w-40 items-center gap-1 rounded-sm border border-(--card-border) bg-(--card-hover) py-0.5 pl-0.5 pr-1.5"
                    >
                        <span className="size-5 shrink-0 overflow-hidden rounded-sm bg-(--card)">
                            {avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatar} alt="" className="size-full object-cover" loading="lazy" />
                            ) : (
                                <span className="flex size-full items-center justify-center">
                                    <Icon icon="mdi:account-outline" className="size-3 text-(--muted)" />
                                </span>
                            )}
                        </span>
                        <span className="truncate text-[11px] text-(--fg)">{name}</span>
                    </span>
                )
            })}
        </div>
    )
}
