'use client'

// 用户名 → 角色头像（确定性哈希分配）。拿不到图标表时降级成一个中性的角色剪影图标。
import { Icon } from '@iconify/react'
import { pickCharacterAvatar } from '@/lib/utils/avatar'

interface Props {
    /** @desc 用户名（同一个人在任何页面都是同一个头像） */
    username: string | null | undefined
    /** @desc 角色名 → 头像地址 */
    icons?: Record<string, string> | null
    /** @desc 尺寸类，如 `size-6` / `size-10`；容器已带 rounded-sm */
    className?: string
    /** @desc 是否显示描边（默认显示） */
    bordered?: boolean
    /** @desc 自定义悬停提示（覆盖默认的「用户名 · 角色名」） */
    hint?: string
}

export default function CharacterAvatar({ username, icons, className = 'size-6', bordered = true, hint }: Props) {
    const avatar = pickCharacterAvatar(username, icons)
    return (
        <span
            className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-(--card-hover) ${
                bordered ? 'border border-(--card-border)' : ''
            } ${className}`}
            title={hint ?? (avatar ? `${username} · ${avatar.name}` : (username ?? ''))}
        >
            {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar.url} alt={avatar.name} className="size-full object-cover" loading="lazy" />
            ) : (
                <Icon icon="mdi:account-outline" className="size-2/3 text-(--muted)" />
            )}
        </span>
    )
}
