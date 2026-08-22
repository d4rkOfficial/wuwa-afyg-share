import Link from 'next/link'
import { Icon } from '@iconify/react'
import TeamBanner from '@/components/team-banner'
import type { ProjectListItem } from '@/lib/types/db'
import { teamDisplayNames } from '@/lib/project/extract'
import { formatCount, timeAgo } from '@/lib/utils/format'

export default function ProjectCard({ project, icons }: { project: ProjectListItem; icons?: Record<string, string> }) {
    const names = teamDisplayNames(project.team_preview)
    // 三个角色头像做卡片右下角叠底：1 号位大→3 号位小，稍微重叠，贴右下边界
    // 仅渲染有真实 CDN 头像的角色；占位图不做底图
    const avatars = [0, 1, 2]
        .map((i) => (names[i] ? icons?.[names[i]] : undefined))
        .filter((src): src is string => !!src)

    return (
        <div className="relative overflow-hidden rounded-none border-2 border-(--card-border) bg-(--card) p-4 transition-colors hover:border-(--accent) hover:bg-(--card-hover)">
            {/* ── 角色头像叠底（右下；1 号大→3 号小，重叠约 1/3） ── */}
            {/* 整组半透明；DOM 顺序左→右，右边后渲染压在左边上面；被遮挡部分实色覆盖 */}
            {/* 边缘用 mask 渐变淡化（alpha 蒙版，非可见颜色渐变）：3/2 号右边界+上边界淡出，1 号上边界淡出 */}
            {avatars[2] && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 right-40 z-0 size-16 opacity-50"
                    style={{
                        WebkitMaskImage:
                            'linear-gradient(to left, transparent, black 35%), linear-gradient(to bottom, transparent, black 35%)',
                        WebkitMaskComposite: 'source-in',
                        maskImage:
                            'linear-gradient(to left, transparent, black 35%), linear-gradient(to bottom, transparent, black 35%)',
                        maskComposite: 'intersect'
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatars[2]} alt="" className="size-full object-cover" />
                </div>
            )}
            {avatars[1] && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 right-24 z-0 size-24 opacity-50"
                    style={{
                        WebkitMaskImage:
                            'linear-gradient(to left, transparent, black 35%), linear-gradient(to bottom, transparent, black 35%)',
                        WebkitMaskComposite: 'source-in',
                        maskImage:
                            'linear-gradient(to left, transparent, black 35%), linear-gradient(to bottom, transparent, black 35%)',
                        maskComposite: 'intersect'
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatars[1]} alt="" className="size-full object-cover" />
                </div>
            )}
            {avatars[0] && (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-0 right-0 z-0 size-32 opacity-50"
                    style={{
                        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 35%)',
                        maskImage: 'linear-gradient(to bottom, transparent, black 35%)'
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={avatars[0]} alt="" className="size-full object-cover" />
                </div>
            )}

            {/* ── 内容（z-10，浮于头像之上） ── */}
            <div className="relative z-10 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-1 text-base font-bold tracking-tight">{project.title}</h3>
                    {project.game_version && (
                        <span className="shrink-0 rounded-none bg-(--card-hover) px-2 py-0.5 text-xs text-(--muted)">
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
                                className="relative z-30 rounded-none bg-(--card-hover) px-2 py-0.5 text-xs text-(--muted) transition-colors hover:bg-(--accent) hover:text-(--accent-fg)"
                            >
                                #{tag}
                            </Link>
                        ))}
                    </div>
                )}

                <div className="mt-auto flex items-center gap-3 text-xs text-(--muted)">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-none bg-(--card-hover) text-[9px] font-semibold text-(--muted)">
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
            </div>

            {/* ── stretched-link 覆盖层（z-20）：整卡可点跳详情页 ── */}
            {/* 卡片根用 <div> 而非 <Link>，避免与标签 <Link> 嵌套成 <a> 内 <a> */}
            {/* 标签链接用 z-30 浮于覆盖层之上，保留各自的跳转 */}
            <Link
                href={`/share/${project.code}`}
                className="absolute inset-0 z-20"
                aria-label={`查看工程：${project.title}`}
            />
        </div>
    )
}
