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

// 页码折叠：首页与尾页常驻（任何位置都能一键跳到第一页 / 最后一页），
// 省略号只出现在真正被折叠的那一侧，不再固定塞在中间。
//   开头附近：1 2 3 4 … N
//   中间位置：1 … p-1 p p+1 … N
//   结尾附近：1 … N-3 N-2 N-1 N
function pageItems(page: number, totalPages: number): (number | '…')[] {
    // 页数够少时全部平铺，不出现省略号
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)

    if (page <= 3) return [1, 2, 3, 4, '…', totalPages]
    if (page >= totalPages - 2) {
        return [1, '…', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    }
    return [1, '…', page - 1, page, page + 1, '…', totalPages]
}

export default function Pagination({ page, totalPages, q, sort, character }: Props) {
    if (totalPages <= 1) return null
    const link = (p: number) => pageHref(p, q, sort, character)

    return (
        <div className="flex items-center justify-center gap-1.5 border-t pt-4 mg-hairline">
            <Link
                href={link(Math.max(1, page - 1))}
                aria-disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-sm border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:border-(--accent) hover:text-(--fg) aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
                <Icon icon="mdi:chevron-left" className="size-4" />
                上一页
            </Link>

            {pageItems(page, totalPages).map((item, i) =>
                item === '…' ? (
                    // 折叠占位：按下有反馈，但点击不改变页码
                    <button
                        key={`e${i}`}
                        type="button"
                        aria-label="更多页码"
                        className="mg-num inline-flex size-8 items-center justify-center rounded-sm border border-(--card-border) bg-(--card) text-sm text-(--muted) transition-[background-color,color,transform] duration-150 ease-out hover:border-(--accent) hover:text-(--fg) active:scale-95 active:bg-(--card-hover)"
                    >
                        …
                    </button>
                ) : (
                    <Link
                        key={item}
                        href={link(item)}
                        aria-current={item === page ? 'page' : undefined}
                        className={`mg-num inline-flex size-8 items-center justify-center rounded-sm text-sm transition-colors ${
                            item === page
                                ? 'border border-(--accent) bg-(--accent) text-(--accent-fg)'
                                : 'border border-(--card-border) bg-(--card) text-(--muted) hover:border-(--accent) hover:text-(--fg)'
                        }`}
                    >
                        {item}
                    </Link>
                )
            )}

            <Link
                href={link(Math.min(totalPages, page + 1))}
                aria-disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-sm border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:border-(--accent) hover:text-(--fg) aria-disabled:pointer-events-none aria-disabled:opacity-50"
            >
                下一页
                <Icon icon="mdi:chevron-right" className="size-4" />
            </Link>
        </div>
    )
}
