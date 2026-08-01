import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Icon } from '@iconify/react'
import TeamBanner from '@/components/team-banner'
import TeamPreview from '@/components/team-preview'
import CopyButton from '@/components/copy-button'
import ExpiryCountdown from '@/components/expiry-countdown'
import SetupNotice from '@/components/setup-notice'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { DETAIL_COLUMNS } from '@/lib/project/query'
import { teamDisplayNames } from '@/lib/project/extract'
import { formatDate, formatCount } from '@/lib/utils/format'
import { siteUrl } from '@/lib/utils/site'
import type { ProjectRow } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
    params
}: {
    params: Promise<{ code: string }>
}): Promise<Metadata> {
    const { code } = await params
    const supabase = await createClient()
    const { data } = await supabase
        .from('projects')
        .select('title, description')
        .eq('code', code)
        .maybeSingle()
    return {
        title: data?.title ?? '工程不存在',
        description: data?.description ?? undefined
    }
}

export default async function SharePage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = await params

    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()

    const { data } = await supabase
        .from('projects')
        .select(DETAIL_COLUMNS)
        .eq('code', code)
        .maybeSingle()

    if (!data) notFound()

    const project = data as ProjectRow
    await supabase.rpc('bump_counter', { p_id: project.id, p_col: 'views' })

    const names = teamDisplayNames(project.team_preview)
    // eslint-disable-next-line react-hooks/purity -- 动态服务端组件按请求时间判断过期
    const isExpired = project.expires_at !== null && new Date(project.expires_at).getTime() <= Date.now()
    const shareUrl = `${siteUrl()}/share/${project.code}`
    const isOwner = user && user.id === project.author_id

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <Link
                href="/"
                className="inline-flex items-center gap-1 text-sm text-(--muted) transition-colors hover:text-(--fg)"
            >
                <Icon icon="mdi:arrow-left" className="size-4" />
                返回广场
            </Link>

            <div className="space-y-4 rounded-2xl border border-(--card-border) bg-(--card) p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold">{project.title}</h1>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-(--muted)">
                            <span className="flex items-center gap-1">
                                <Icon icon="mdi:account-outline" className="size-4" />
                                {project.author_name}
                            </span>
                            <span>{formatDate(project.created_at)}</span>
                            {project.game_version && <span>v{project.game_version}</span>}
                            {project.expires_at && !isExpired && <ExpiryCountdown expiresAt={project.expires_at} />}
                        </div>
                    </div>
                </div>

                <TeamBanner names={names} size="lg" />

                {project.description && (
                    <p className="whitespace-pre-wrap text-sm text-(--muted)">{project.description}</p>
                )}

                {project.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {project.tags.map((tag) => (
                            <span
                                key={tag}
                                className="rounded-md bg-(--card-hover) px-2 py-0.5 text-xs text-(--muted)"
                            >
                                #{tag}
                            </span>
                        ))}
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-(--card-border) pt-4">
                    <a
                        href={`/share/${project.code}/download`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-(--btn-text)"
                        style={{ background: 'var(--btn-bg)' }}
                    >
                        <Icon icon="mdi:download" className="size-4" />
                        下载工程 JSON
                    </a>
                    <CopyButton text={shareUrl} />
                    {isOwner && (
                        <Link
                            href="/me"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                        >
                            <Icon icon="mdi:account-cog-outline" className="size-4" />
                            管理
                        </Link>
                    )}
                    <div className="flex-1" />
                    <div className="flex items-center gap-3 text-sm text-(--muted)">
                        <span className="flex items-center gap-1">
                            <Icon icon="mdi:eye-outline" className="size-4" />
                            {formatCount(project.view_count)}
                        </span>
                        <span className="flex items-center gap-1">
                            <Icon icon="mdi:content-copy" className="size-4" />
                            {formatCount(project.clone_count)}
                        </span>
                    </div>
                </div>
            </div>

            <TeamPreview
                slots={project.team_preview?.slots ?? []}
                locked={project.team_preview?.locked ?? { team: false, timeline: false, calculation: false, config: false }}
            />
        </div>
    )
}
