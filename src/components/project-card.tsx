import Link from 'next/link'
import { Icon } from '@iconify/react'
import TeamBanner from '@/components/team-banner'
import type { ProjectListItem } from '@/lib/types/db'
import { teamDisplayNames } from '@/lib/project/extract'
import { formatCount, timeAgo } from '@/lib/utils/format'

export default function ProjectCard({ project }: { project: ProjectListItem }) {
    const names = teamDisplayNames(project.team_preview)
    return (
        <Link
            href={`/share/${project.code}`}
            className="flex flex-col gap-3 rounded-xl border border-(--card-border) bg-(--card) p-4 transition-colors hover:border-(--accent)/50 hover:bg-(--card-hover)"
        >
            <div className="flex items-start justify-between gap-3">
                <h3 className="line-clamp-1 text-base font-semibold">{project.title}</h3>
                {project.game_version && (
                    <span className="shrink-0 rounded-md bg-(--card-hover) px-2 py-0.5 text-xs text-(--muted)">
                        {project.game_version}
                    </span>
                )}
            </div>

            <TeamBanner names={names} />

            {project.description && (
                <p className="line-clamp-2 text-sm text-(--muted)">{project.description}</p>
            )}

            {project.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                        <Link
                            key={tag}
                            href={`/?q=${encodeURIComponent(tag)}`}
                            className="rounded-md bg-(--card-hover) px-2 py-0.5 text-xs text-(--muted) transition-colors hover:bg-(--accent)/10 hover:text-(--accent-text)"
                        >
                            #{tag}
                        </Link>
                    ))}
                </div>
            )}

            <div className="mt-auto flex items-center gap-3 text-xs text-(--muted)">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-(--card-hover) text-[9px] font-semibold text-(--muted)">
                        {project.author_name?.charAt(0) || '?'}
                    </span>
                    <span className="truncate">{project.author_name}</span>
                </span>
                <span className="shrink-0">{timeAgo(project.created_at)}</span>
                <div className="flex-1" />
                <span className="flex items-center gap-0.5">
                    <Icon icon="mdi:eye-outline" className="size-3.5" />
                    {formatCount(project.view_count)}
                </span>
                <span className="flex items-center gap-0.5">
                    <Icon icon="mdi:content-copy" className="size-3.5" />
                    {formatCount(project.clone_count)}
                </span>
            </div>
        </Link>
    )
}
