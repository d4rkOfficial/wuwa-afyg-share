// 分页（新系统）
// 当前页不填充实心色：每屏只允许一个实心主操作，分页用「浅底 + 描边」表达当前页。
import Link from 'next/link'
import { Icon } from '@iconify/react'

function pageHref(page: number, q: string, sort: string, character: string): string {
    const params = new URLSearchParams()
    if (page > 1) params.set('page', String(page))
    if (q) params.set('q', q)
    if (sort !== 'latest') params.set('sort', sort)
    if (character) params.set('character', character)
    return params.size > 0 ? `/?${params.toString()}` : '/'
}

/** @desc 首页与尾页常驻；省略号只在真正被折叠的一侧出现，且不可点击 */
function pageItems(page: number, totalPages: number): Array<number | 'gap'> {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
    if (page <= 3) return [1, 2, 3, 4, 'gap', totalPages]
    if (page >= totalPages - 2) return [1, 'gap', totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    return [1, 'gap', page - 1, page, page + 1, 'gap', totalPages]
}

export default function Pagination({
    page,
    totalPages,
    q,
    sort,
    character
}: {
    page: number
    totalPages: number
    q: string
    sort: 'latest' | 'hot'
    character: string
}) {
    if (totalPages <= 1) return null

    return (
        <nav className="wk-pager" aria-label="分页">
            <Link
                href={pageHref(Math.max(1, page - 1), q, sort, character)}
                className="wk-btn wk-btn--sm"
                aria-disabled={page <= 1}
                style={page <= 1 ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
            >
                <Icon icon="mdi:chevron-left" className="wk-nav-icon" aria-hidden="true" />
                上一页
            </Link>

            {pageItems(page, totalPages).map((item, index) =>
                item === 'gap' ? (
                    <span key={`gap-${index}`} className="wk-meta" aria-hidden="true" style={{ padding: '0 4px' }}>
                        …
                    </span>
                ) : (
                    <Link
                        key={item}
                        href={pageHref(item, q, sort, character)}
                        className="wk-btn wk-btn--sm wk-pager-num"
                        aria-current={item === page ? 'page' : undefined}
                    >
                        {item}
                    </Link>
                )
            )}

            <Link
                href={pageHref(Math.min(totalPages, page + 1), q, sort, character)}
                className="wk-btn wk-btn--sm"
                aria-disabled={page >= totalPages}
                style={page >= totalPages ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
            >
                下一页
                <Icon icon="mdi:chevron-right" className="wk-nav-icon" aria-hidden="true" />
            </Link>
        </nav>
    )
}
