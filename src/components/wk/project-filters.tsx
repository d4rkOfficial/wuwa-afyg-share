'use client'

// 广场筛选条（新系统）
// 变化点：去掉多余的「搜索」按钮（回车提交）；角色筛选改用原生 <optgroup> 下拉
// （旧的自定义 listbox 没有方向键、没有 aria-activedescendant，键盘用户必须逐个 Tab）；
// 角色属性表由服务端传入，客户端不再自己 fetch（旧实现导致卡片色块 hydration 后才上色）。
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { WkDropdown, WkInput, WkSegmented } from '@/design'
import { ELEMENTS, ELEMENT_COLORS } from '@/lib/types/project'

export default function ProjectFilters({
    q,
    sort,
    character,
    elements
}: {
    q: string
    sort: 'hot' | 'latest'
    character: string
    elements: Record<string, string>
}) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [query, setQuery] = useState(q)

    const groups = ELEMENTS.map((element) => ({
        element,
        names: Object.keys(elements).filter((name) => elements[name] === element)
    })).filter((group) => group.names.length > 0)

    const hasFilter = Boolean(q || character) || sort !== 'latest'

    function navigate(next: { q?: string; sort?: 'hot' | 'latest'; character?: string }) {
        const params = new URLSearchParams()
        const nextQuery = next.q ?? q
        const nextSort = next.sort ?? sort
        const nextCharacter = next.character ?? character
        if (nextQuery) params.set('q', nextQuery)
        if (nextSort !== 'latest') params.set('sort', nextSort)
        if (nextCharacter) params.set('character', nextCharacter)
        const href = params.size > 0 ? `/?${params.toString()}` : '/'
        startTransition(() => router.push(href))
    }

    return (
        <div className="wk-toolbar" data-pending={isPending} style={{ gap: 8 }}>
            <form
                onSubmit={(event) => {
                    event.preventDefault()
                    navigate({ q: query.trim() })
                }}
                style={{ flex: 1, minWidth: 200, maxWidth: 320 }}
            >
                <label style={{ display: 'block' }}>
                    <span className="sr-only">搜索工程</span>
                    <WkInput
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="搜索标题、作者、角色或标签…"
                        aria-label="搜索工程"
                    />
                </label>
            </form>

            <WkDropdown
                value={character}
                ariaLabel="按队伍角色筛选"
                onChange={(next) => navigate({ character: next })}
                width={150}
                placeholder="全部角色"
                groups={[
                    { options: [{ value: '', label: '全部角色' }] },
                    ...groups.map((group) => ({
                        label: group.element,
                        options: group.names.map((name) => ({
                            value: name,
                            label: name,
                            tone: ELEMENT_COLORS[group.element]
                        }))
                    }))
                ]}
            />

            <WkSegmented
                value={sort}
                onChange={(next) => navigate({ sort: next })}
                ariaLabel="排序方式"
                options={[
                    { value: 'latest', label: '最新' },
                    { value: 'hot', label: '最热' }
                ]}
            />

            {hasFilter && (
                <Link href="/" className="wk-clear">
                    清除筛选
                </Link>
            )}

            <span className="sr-only" aria-live="polite">
                {isPending ? '正在更新工程列表' : '工程列表已更新'}
            </span>
        </div>
    )
}
