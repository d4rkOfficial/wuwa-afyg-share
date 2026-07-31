import Link from 'next/link'
import { Icon } from '@iconify/react'
import ProjectCard from '@/components/project-card'
import SetupNotice from '@/components/setup-notice'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { LIST_COLUMNS } from '@/lib/project/query'
import type { ProjectListItem } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

export default async function HomePage({
    searchParams
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const sp = await searchParams
    const q = typeof sp.q === 'string' ? sp.q.trim() : ''
    const sort = typeof sp.sort === 'string' && sp.sort === 'hot' ? 'hot' : 'latest'

    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()

    let query = supabase.from('projects').select(LIST_COLUMNS).eq('published', true)
    if (q) query = query.ilike('title', `%${q}%`)
    query = query.order(sort === 'hot' ? 'clone_count' : 'created_at', { ascending: false }).limit(30)

    const { data, error } = await query
    const items = (data ?? []) as ProjectListItem[]

    if (items.length > 0) {
        const { data: likes } = await supabase
            .from('likes')
            .select('project_id, user_id')
            .in('project_id', items.map((i) => i.id))
        const countMap = new Map<string, number>()
        const mySet = new Set<string>()
        for (const l of likes ?? []) {
            countMap.set(l.project_id, (countMap.get(l.project_id) ?? 0) + 1)
            if (user && l.user_id === user.id) mySet.add(l.project_id)
        }
        for (const item of items) {
            item.like_count = countMap.get(item.id) ?? 0
            item.liked_by_me = mySet.has(item.id)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                    <h1 className="text-xl font-bold">工程广场</h1>
                    <p className="text-sm text-(--muted)">浏览社区分享的拉表排轴工程，一键克隆回你的工具箱</p>
                </div>
                <form action="/" method="get" className="flex gap-2">
                    <input
                        type="search"
                        name="q"
                        defaultValue={q}
                        placeholder="搜索工程名称..."
                        className="w-56 rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
                    />
                    <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-(--btn-text)"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon="mdi:magnify" className="size-4" />
                        搜索
                    </button>
                </form>
            </div>

            <div className="flex items-center gap-2">
                {(
                    [
                        { key: 'latest', label: '最新' },
                        { key: 'hot', label: '最热' }
                    ] as const
                ).map(({ key, label }) => {
                    const active = sort === key
                    const href = `/?sort=${key}${q ? `&q=${encodeURIComponent(q)}` : ''}`
                    return (
                        <Link
                            key={key}
                            href={href}
                            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                                active
                                    ? 'bg-(--accent) text-white'
                                    : 'border border-(--card-border) bg-(--card) text-(--muted) hover:text-(--fg)'
                            }`}
                        >
                            {label}
                        </Link>
                    )
                })}
            </div>

            {error ? (
                <div className="rounded-xl border border-(--card-border) bg-(--card) p-8 text-center text-(--muted)">
                    加载失败：{error.message}
                </div>
            ) : items.length === 0 ? (
                <div className="rounded-xl border border-(--card-border) bg-(--card) p-12 text-center">
                    <Icon icon="mdi:package-variant-closed" className="mx-auto mb-3 size-10 text-(--muted)" />
                    <p className="text-(--muted)">{q ? `没有找到「${q}」相关工程` : '还没有人分享工程'}</p>
                    <Link
                        href="/upload"
                        className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-(--btn-text)"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon="mdi:plus" className="size-4" />
                        上传第一个工程
                    </Link>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((p) => (
                        <ProjectCard key={p.id} project={p} />
                    ))}
                </div>
            )}
        </div>
    )
}
