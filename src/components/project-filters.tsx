'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { CHAR_ELEMENTS } from '@/lib/data/char-elements'
import { ELEMENTS } from '@/lib/types/project'

interface Props {
    q: string
    sort: 'hot' | 'latest'
    character: string
}

const CHARACTERS_BY_ELEMENT = ELEMENTS.map((element) => ({
    element,
    names: Object.keys(CHAR_ELEMENTS).filter((name) => CHAR_ELEMENTS[name] === element)
})).filter((group) => group.names.length > 0)

export default function ProjectFilters({ q, sort, character }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [query, setQuery] = useState(q)
    const [selectedSort, setSelectedSort] = useState(sort)
    const [selectedCharacter, setSelectedCharacter] = useState(character)

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
            className="project-filter-shell flex flex-wrap items-center gap-2 rounded-xl border border-(--card-border) bg-(--card) p-2"
            data-pending={isPending}
            aria-label="工程筛选"
        >
            <form
                className="flex min-w-[min(100%,18rem)] flex-1 gap-2"
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
                        className="h-9 w-full rounded-lg border border-(--card-border) bg-(--input-bg) pl-9 pr-3 text-sm outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-(--muted) focus:border-(--accent)/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_10%,transparent)]"
                    />
                </label>
                <button
                    type="submit"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-(--btn-text) transition-[filter,transform] duration-200 ease-out hover:brightness-110 active:scale-[0.97]"
                    style={{ background: 'var(--btn-bg)' }}
                >
                    <Icon icon={isPending ? 'mdi:loading' : 'mdi:arrow-right'} className={isPending ? 'size-4 animate-spin' : 'size-4'} />
                    搜索
                </button>
            </form>

            <div className="flex h-9 shrink-0 items-center rounded-lg border border-(--card-border) bg-(--input-bg) p-0.5">
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
                            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm transition-[background-color,color,transform] duration-200 ease-out active:scale-[0.97] ${
                                active
                                    ? 'bg-(--accent) font-medium text-(--accent-fg) shadow-sm'
                                    : 'text-(--muted) hover:text-(--fg)'
                            }`}
                        >
                            <Icon icon={icon} className="size-4" />
                            {label}
                        </button>
                    )
                })}
            </div>

            <label className="group flex h-9 min-w-40 shrink-0 items-center gap-2 rounded-lg border border-(--card-border) bg-(--input-bg) pl-2.5 transition-[border-color,box-shadow] duration-200 focus-within:border-(--accent)/60 focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_10%,transparent)]">
                <span className="flex items-center gap-1.5 text-xs font-medium text-(--muted)">
                    <Icon icon="mdi:account-group-outline" className="size-4" />
                    队伍
                </span>
                <select
                    value={selectedCharacter}
                    onChange={(event) => {
                        const nextCharacter = event.target.value
                        setSelectedCharacter(nextCharacter)
                        navigate({ character: nextCharacter })
                    }}
                    aria-label="按队伍角色筛选"
                    className="h-full min-w-0 flex-1 cursor-pointer bg-transparent pr-7 text-sm font-medium text-(--fg) outline-none"
                >
                    <option value="">全部角色</option>
                    {CHARACTERS_BY_ELEMENT.map(({ element, names }) => (
                        <optgroup key={element} label={element}>
                            {names.map((name) => (
                                <option key={name} value={name}>
                                    {name}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
            </label>

            <span className="sr-only" aria-live="polite">
                {isPending ? '正在更新工程列表' : '工程列表已更新'}
            </span>
            <span className="project-filter-progress" aria-hidden="true" />
        </section>
    )
}
