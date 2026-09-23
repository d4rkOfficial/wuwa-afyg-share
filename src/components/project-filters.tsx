'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { CHAR_ELEMENTS } from '@/lib/data/char-elements'
import type { LatestCharElements } from '@/lib/data/char-elements-latest'
import { ELEMENTS, ELEMENT_COLORS } from '@/lib/types/project'
import { elementIcon } from '@/lib/consts/element-icons'
import SelectMenu from '@/components/ui/select-menu'

interface Props {
    q: string
    sort: 'hot' | 'latest'
    character: string
}

const CHAR_ELEMENTS_CACHE_KEY = 'wuwa-afyg:char-elements'

function readCachedCharElements(): Record<string, string> {
    if (typeof window === 'undefined') return CHAR_ELEMENTS
    try {
        const cached = JSON.parse(localStorage.getItem(CHAR_ELEMENTS_CACHE_KEY) ?? '') as Partial<LatestCharElements>
        return cached.elements && typeof cached.elements === 'object' ? cached.elements : CHAR_ELEMENTS
    } catch {
        return CHAR_ELEMENTS
    }
}

function groupCharacters(elements: Record<string, string>) {
    return ELEMENTS.map((element) => ({
        element,
        names: Object.keys(elements).filter((name) => elements[name] === element)
    })).filter((group) => group.names.length > 0)
}

export default function ProjectFilters({ q, sort, character }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [query, setQuery] = useState(q)
    const [selectedSort, setSelectedSort] = useState(sort)
    const [selectedCharacter, setSelectedCharacter] = useState(character)
    const [charElements, setCharElements] = useState(CHAR_ELEMENTS)

    useEffect(() => {
        let active = true
        Promise.resolve().then(() => {
            if (active) setCharElements(readCachedCharElements())
        })

        fetch('/api/char-elements', { cache: 'no-store' })
            .then((response) => {
                if (!response.ok) throw new Error('角色数据获取失败')
                return response.json() as Promise<LatestCharElements>
            })
            .then((latest) => {
                if (!latest.elements || typeof latest.elements !== 'object') return
                try {
                    localStorage.setItem(CHAR_ELEMENTS_CACHE_KEY, JSON.stringify(latest))
                } catch {
                    // 本地存储不可用时仍使用本次请求的数据
                }
                if (active) setCharElements(latest.elements)
            })
            .catch(() => {
                // 使用生成文件或本地缓存作为离线兜底
            })

        return () => {
            active = false
        }
    }, [])

    const charactersByElement = groupCharacters(charElements)

    function navigate(next: { q?: string; sort?: 'hot' | 'latest'; character?: string }) {
        const params = new URLSearchParams()
        const nextQuery = next.q ?? q
        const nextSort = next.sort ?? selectedSort
        const nextCharacter = next.character ?? selectedCharacter

        if (nextQuery) params.set('q', nextQuery)
        if (nextSort !== 'latest') params.set('sort', nextSort)
        if (nextCharacter) params.set('character', nextCharacter)

        const href = params.size > 0 ? `/?${params.toString()}` : '/'
        startTransition(() => router.push(href))
    }

    return (
        <section
            className="project-filter-shell rounded-none border border-(--card-border) bg-(--card) p-2"
            data-pending={isPending}
            aria-label="工程筛选"
        >
            <form
                className="project-filter-search"
                onSubmit={(event) => {
                    event.preventDefault()
                    navigate({ q: query.trim() })
                }}
            >
                <label className="relative min-w-0 flex-1">
                    <span className="sr-only">搜索工程名称</span>
                    <Icon
                        icon="mdi:magnify"
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-(--muted)"
                    />
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="搜索工程名称..."
                        className="h-10 w-full rounded-none border border-(--card-border) bg-(--input-bg) pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-(--muted) focus:border-(--accent) "
                    />
                </label>
                <button
                    type="submit"
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-none px-3.5 text-sm font-medium border border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-[filter,transform] duration-200 ease-out  "
                >
                    <Icon icon={isPending ? 'mdi:loading' : 'mdi:arrow-right'} className={isPending ? 'size-4 animate-spin' : 'size-4'} />
                    搜索
                </button>
            </form>

            <div className="project-filter-sort flex h-10 shrink-0 items-center rounded-none border border-(--card-border) bg-(--input-bg) p-0.5">
                {(
                    [
                        { key: 'latest', label: '最新', icon: 'mdi:clock-outline' },
                        { key: 'hot', label: '最热', icon: 'mdi:fire' }
                    ] as const
                ).map(({ key, label, icon }) => {
                    const active = selectedSort === key
                    return (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                                setSelectedSort(key)
                                navigate({ sort: key })
                            }}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-none px-2.5 text-sm transition-[background-color,color,transform] duration-200 ease-out  ${
                                active
                                    ? 'bg-(--accent) font-medium text-(--accent-fg) '
                                    : 'text-(--muted) hover:text-(--fg)'
                            }`}
                        >
                            <Icon icon={icon} className="size-4" />
                            {label}
                        </button>
                    )
                })}
            </div>

            <div className="project-filter-character group flex h-10 min-w-40 shrink-0 items-center rounded-none border border-(--card-border) bg-(--input-bg) transition-[border-color,box-shadow] duration-200 focus-within:border-(--accent) ">
                <SelectMenu
                    value={selectedCharacter}
                    onChange={(nextCharacter) => {
                        setSelectedCharacter(nextCharacter)
                        navigate({ character: nextCharacter })
                    }}
                    placeholder="全部角色"
                    icon="mdi:account-group-outline"
                    allOption="全部角色"
                    groups={charactersByElement.map(({ element, names }) => ({
                        label: element,
                        icon: elementIcon(element),
                        accentColor: ELEMENT_COLORS[element],
                        options: names.map((name) => ({ value: name, label: name }))
                    }))}
                    ariaLabel="按队伍角色筛选"
                />
            </div>

            <span className="sr-only" aria-live="polite">
                {isPending ? '正在更新工程列表' : '工程列表已更新'}
            </span>
            <span className="project-filter-progress" aria-hidden="true" />
        </section>
    )
}
