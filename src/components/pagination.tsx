import Link from 'next/link'
import { Icon } from '@iconify/react'

interface Props {
    page: number
    totalPages: number
    q: string
    sort: 'hot' | 'latest'
    character: string
}

function pageHref(page: number, q: string, sort: string, character: string): string {
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (q) params.set('q', q)
    params.set('sort', sort)
    if (character) params.set('character', character)
    return `/?${params.toString()}`
}

function pageItems(page: number, totalPages: number): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const set = new Set<number>([1, 2, totalPages - 1, totalPages, page - 1, page, page + 1])
    const sorted = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b)
    const out: (number | '…')[] = []
    let prev = 0
    for (const n of sorted) {
        if (n - prev > 1) out.push('…')
        out.push(n)
        prev = n
    }
    return out
}

export default function Pagination({ page, totalPages, q, sort, character }: Props) {
    if (totalPages <= 1) return null
    const link = (p: number) => pageHref(p, q, sort, character)

    return (
        <div className="flex items-center justify-center gap-1.5 pt-2">
            <Link
                href={link(Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:text-(--fg) aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
                <Icon icon="mdi:chevron-left" className="size-4" />
                上一页
            </Link>

            {pageItems(page, totalPages).map((item, i) =>
                item === '…' ? (
                    <span key={`e${i}`} className="px-1 text-sm text-(--muted)">
                        …
                    </span>
                ) : (
                    <Link
                        key={item}
                        href={link(item)}
                        aria-current={item === page ? 'page' : undefined}
                        className={`inline-flex size-8 items-center justify-center rounded-none text-sm transition-colors ${
                            item === page
                                ? 'border-2 border-(--accent) bg-(--accent) font-bold text-(--accent-fg)'
                                : 'border-2 border-(--card-border) bg-(--card) text-(--muted) hover:text-(--fg)'
                        }`}
                    >
                        {item}
                    </Link>
                )
            )}

            <Link
                href={link(Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:text-(--fg) aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
                下一页
                <Icon icon="mdi:chevron-right" className="size-4" />
            </Link>
        </div>
    )
}
