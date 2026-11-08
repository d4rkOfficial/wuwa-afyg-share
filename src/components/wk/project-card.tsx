// 工程卡（新系统）
// 保留角色头像叠底作为品牌视觉，但三条约束保证不压字：
//   ① 叠底 pointer-events:none  ② 叠底 z-index 0 / 内容 1  ③ 朝文字方向蒙版淡出 + 元信息行实色底
// 卡片只给「看得懂就够」的信息：不显示发布时间、不显示浏览/克隆数（这些留给详情页），
// 右下角固定一个「简表速览」外链跳转。简介按 Markdown 处理，但**只留换行与链接**。
import Link from 'next/link'
import { Icon } from '@iconify/react'
import { WkBadge, WkSpacer } from '@/design'
import { teamDisplayNames } from '@/lib/project/extract'
import { toCardPreview } from '@/lib/markdown'
import { fastCalcUrl } from '@/lib/utils/site'
import { pickCharacterAvatar } from '@/lib/utils/avatar'
import type { ProjectListItem } from '@/lib/types/db'

/** @desc 叠底头像尺寸：1 号位最大（76）、3 号位最小（40）；渲染顺序反向，让 1 号位在最右且压在最上 */
const ART_SIZES = [132, 100, 72]

export default function ProjectCard({
    project,
    icons,
    elements
}: {
    project: ProjectListItem
    icons?: Record<string, string>
    /** 角色 → 属性，服务端传入。不要再在客户端取（旧实现导致整片色块 hydration 后才上色） */
    elements?: Record<string, string>
}) {
    const names = teamDisplayNames(project.team_preview)
    const authorAvatar = pickCharacterAvatar(project.author_name, icons)
    // 只渲染有真实 CDN 头像的角色，占位图不做叠底
    const avatars = [0, 1, 2]
        .map((slot) => (names[slot] ? icons?.[names[slot]] : undefined))
        .filter((src): src is string => !!src)
    // avatars 顺序是 1 号位→3 号位；反转后按 3→1 渲染，1 号位在最右、压在最上
    const artLayers = avatars.map((src, slot) => ({ src, size: ART_SIZES[slot] ?? 40 })).reverse()

    return (
        <article className="wk-card wk-card-pad wk-pcard">
            {artLayers.length > 0 && (
                <div className="wk-card-art" aria-hidden="true">
                    {artLayers.map((layer, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            key={`${layer.src}-${index}`}
                            src={layer.src}
                            alt=""
                            loading="lazy"
                            style={{ width: layer.size, height: layer.size, marginLeft: index === 0 ? 0 : -26 }}
                        />
                    ))}
                </div>
            )}

            <div className="wk-card-inner">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <h3 className="wk-pcard-title">{project.title}</h3>
                    {project.game_version && <WkBadge>{project.game_version}</WkBadge>}
                </div>

                {names.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {names.map((name, slot) => {
                            const element = elements?.[name]
                            return (
                                <span
                                    key={`${name}-${slot}`}
                                    className="wk-badge"
                                    style={
                                        element
                                            ? {
                                                  color: `var(--element-${element})`,
                                                  borderColor: `color-mix(in srgb, var(--element-${element}) 55%, transparent)`
                                              }
                                            : undefined
                                    }
                                >
                                    {name}
                                </span>
                            )
                        })}
                    </div>
                )}

                {project.description && (
                    <p className="wk-pcard-desc">
                        {toCardPreview(project.description).map((segment, index) =>
                            segment.kind === 'link' ? (
                                <a
                                    key={index}
                                    href={segment.href}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    title={segment.href}
                                >
                                    {segment.text}
                                </a>
                            ) : (
                                <span key={index}>{segment.text}</span>
                            )
                        )}
                    </p>
                )}

                {project.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {project.tags.map((tag) => (
                            <Link
                                key={tag}
                                href={`/?q=${encodeURIComponent(tag)}`}
                                className="wk-pcard-tag"
                                style={{ position: 'relative', zIndex: 2 }}
                            >
                                #{tag}
                            </Link>
                        ))}
                    </div>
                )}

                <div className="wk-card-foot">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span className="wk-pcard-avatar">
                            {authorAvatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={authorAvatar.url} alt="" loading="lazy" />
                            ) : (
                                <span aria-hidden="true" />
                            )}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {project.author_name}
                        </span>
                    </span>
                    <WkSpacer />
                    <a
                        href={fastCalcUrl(project.code)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="wk-pcard-jump"
                        title="在工具箱里打开这份工程的简表速览"
                    >
                        <Icon icon="mdi:table-eye" className="wk-nav-icon" aria-hidden="true" />
                        简表速览
                    </a>
                </div>
            </div>

            {/* 整卡可点：stretched link 在最底层（z-index 0），内容层 z-index 1，标签单独提 z-index 2 */}
            <Link href={`/share/${project.code}`} className="wk-pcard-link" aria-label={`查看工程：${project.title}`} />
        </article>
    )
}
