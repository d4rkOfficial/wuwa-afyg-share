'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { copyText } from '@/lib/utils/clipboard'

interface Props {
    text: string
    label?: string
}

export default function CopyButton({ text, label = '复制链接' }: Props) {
    const [copied, setCopied] = useState(false)

    async function onClick() {
        if (await copyText(text)) {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } else {
            setCopied(false)
        }
    }

    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg)"
        >
            <Icon icon={copied ? 'mdi:check' : 'mdi:content-copy'} className="size-4" />
            {copied ? '已复制' : label}
        </button>
    )
}
