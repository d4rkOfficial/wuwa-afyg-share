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
                        <span
                            key={tag}
                            className="rounded-md bg-(--card-hover) px-2 py-0.5 text-xs text-(--muted)"
                        >
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            <div className="mt-auto flex items-center gap-3 text-xs text-(--muted)">
                <span className="flex items-center gap-1">
                    <Icon icon="mdi:account-outline" className="size-3.5" />
                    {project.author_name}
                </span>
                <span>{timeAgo(project.created_at)}</span>
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
