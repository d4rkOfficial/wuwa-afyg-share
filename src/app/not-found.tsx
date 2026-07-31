import Link from 'next/link'
import { Icon } from '@iconify/react'

export default function NotFound() {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Icon icon="mdi:link-off" className="size-12 text-(--muted)" />
            <h2 className="text-xl font-semibold">分享已失效或不存在</h2>
            <p className="text-sm text-(--muted)">该分享链接可能已过期、被作者删除或从未存在。</p>
            <Link
                href="/"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-(--btn-text)"
                style={{ background: 'var(--btn-bg)' }}
            >
                <Icon icon="mdi:arrow-left" className="size-4" />
                返回广场
            </Link>
        </div>
    )
}
