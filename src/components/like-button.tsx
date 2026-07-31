'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { toggleLike } from '@/lib/actions/projects'

interface Props {
    projectId: string
    initialCount: number
    initialLiked: boolean
    loggedIn: boolean
    size?: 'sm' | 'md' | 'lg'
}

export default function LikeButton({
    projectId,
    initialCount,
    initialLiked,
    loggedIn,
    size = 'md'
}: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [liked, setLiked] = useState(initialLiked)
    const [count, setCount] = useState(initialCount)

    function onClick() {
        if (!loggedIn) {
            router.push('/login?redirect=/')
            return
        }
        startTransition(async () => {
            const res = await toggleLike(projectId)
            if (res.error) return
            setLiked(res.data!.liked)
            setCount((c) => c + (res.data!.liked ? 1 : -1))
        })
    }

    const padding = size === 'lg' ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-sm'

    return (
        <button
            onClick={onClick}
            disabled={pending}
            className={`inline-flex items-center gap-1.5 rounded-lg border transition-colors disabled:opacity-50 ${padding} ${
                liked
                    ? 'border-(--danger)/40 text-(--danger-text)'
                    : 'border-(--card-border) bg-(--card) text-(--muted) hover:border-(--danger)/40 hover:text-(--danger-text)'
            }`}
        >
            <Icon icon={liked ? 'mdi:heart' : 'mdi:heart-outline'} className="size-4" />
            {count > 0 && count}
        </button>
    )
}
