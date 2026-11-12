import '@/design/wk-overlay.css'
import '@/design/wk-plaza.css'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import TeamPreview from '@/components/wk/team-preview'
import ShareLinkDialog from '@/components/wk/share-link-dialog'
import WkCopyButton from '@/components/wk/copy-button'
import WkMarkdown from '@/components/wk/markdown'
import SetupNotice from '@/components/setup-notice'
import { WkBadge, WkContainer, WkEmpty, WkRoot, WkSpacer } from '@/design'
import { markdownToPlainText } from '@/lib/markdown'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getAvatarIcons } from '@/lib/data/avatar-icons'
import { getCharElements } from '@/lib/data/char-elements-latest'
import { DETAIL_COLUMNS } from '@/lib/project/query'
import { teamDisplayNames } from '@/lib/project/extract'
import { formatDate, formatCount } from '@/lib/utils/format'
import { isExpiredProject, isGracePeriod } from '@/lib/utils/expiry'
import { pickCharacterAvatar } from '@/lib/utils/avatar'
import { fastCalcUrl } from '@/lib/utils/site'
import type { ProjectRow } from '@/lib/types/db'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
    params
}: {
    params: Promise<{ code: string }>
}): Promise<Metadata> {
    const { code } = await params
    const supabase = await createClient()
    const { data } = await supabase.from('projects').select('title, description').eq('code', code).maybeSingle()
    return {
        title: data?.title ?? '工程不存在',
        description: data?.description ? markdownToPlainText(data.description) : undefined
    }
}

/** @desc 剩余天数（向上取整）；无过期时间返回 null */
function daysLeft(expiresAt: string | null): number | null {
    if (!expiresAt) return null
    const diff = new Date(expiresAt).getTime() - Date.now()
    return Math.ceil(diff / 86_400_000)
}

export default async function SharePage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = await params

    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()

    const { data } = await supabase.from('projects').select(DETAIL_COLUMNS).eq('code', code).maybeSingle()

    if (!data) notFound()

    const project = data as ProjectRow
    await supabase.rpc('bump_counter', { p_id: project.id, p_col: 'views' })

    const names = teamDisplayNames(project.team_preview)
    const expired = isExpiredProject(project.expires_at, project.author_name)
    const grace = isGracePeriod(project.expires_at, project.author_name)
    const isOwner = user && user.id === project.author_id
    const charIcons = await getAvatarIcons()
    // 属性色：与其余页面共用同一份带缓存的上游数据（6 小时一刷），不再读任何写死的表
    const elements = await getCharElements()

    if (expired) {
        return (
            <WkRoot>
                <WkContainer>
                    <WkEmpty
                        title="该工程分享已过期"
                        hint="链接已失效，可联系作者重新分享。"
                        action={
                            <Link href="/" className="wk-btn wk-btn--sm">
                                返回广场
                            </Link>
                        }
                    />
                </WkContainer>
            </WkRoot>
        )
    }

    const authorAvatar = pickCharacterAvatar(project.author_name, charIcons)
    const remaining = daysLeft(project.expires_at)

    return (
        <WkRoot>
            <WkContainer>
                <article style={{ display: 'grid', gap: 20, maxWidth: 720 }}>
                    {/* 标题区：标题 + 一行元信息 */}
                    <header style={{ display: 'grid', gap: 8, paddingBottom: 16, borderBottom: '1px solid var(--wk-line)' }}>
                        <h1 style={{ fontSize: 'var(--wk-t-page)' }}>{project.title}</h1>
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 'var(--wk-t-meta)',
                                color: 'var(--wk-fg-3)'
                            }}
                        >
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <span className="wk-pcard-avatar">
                                    {authorAvatar ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={authorAvatar.url} alt="" loading="lazy" />
                                    ) : null}
                                </span>
                                {project.author_name}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatDate(project.created_at)}</span>
                            {project.game_version && (
                                <>
                                    <span aria-hidden="true">·</span>
                                    <WkBadge>{project.game_version}</WkBadge>
                                </>
                            )}
                            {grace ? (
                                <WkBadge tone="warn">宽限中</WkBadge>
                            ) : remaining !== null ? (
                                <WkBadge tone={remaining <= 3 ? 'warn' : 'default'}>
                                    {remaining <= 0 ? '今天到期' : `剩余 ${remaining} 天`}
                                </WkBadge>
                            ) : (
                                <WkBadge>永久有效</WkBadge>
                            )}
                        </div>
                    </header>

                    {/* 配队徽标 */}
                    {names.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {names.map((name, slot) => {
                                const element = elements[name]
                                return (
                                    <span
                                        key={`${name}-${slot}`}
                                        className="wk-badge"
                                        style={{
                                            height: 24,
                                            fontSize: 'var(--wk-t-body)',
                                            padding: '0 10px',
                                            color: element ? `var(--element-${element})` : 'var(--wk-fg)',
                                            borderColor: element
                                                ? `color-mix(in srgb, var(--element-${element}) 55%, transparent)`
                                                : undefined
                                        }}
                                    >
                                        {name}
                                    </span>
                                )
                            })}
                        </div>
                    )}

                    {project.description && <WkMarkdown source={project.description} />}

                    {project.tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {project.tags.map((tag) => (
                                <Link key={tag} href={`/?q=${encodeURIComponent(tag)}`} className="wk-pcard-tag">
                                    #{tag}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* 操作行：一个实心主操作（在工具箱中打开），其余次级 */}
                    <div className="wk-toolbar" style={{ paddingTop: 16, borderTop: '1px solid var(--wk-line)' }}>
                        <ShareLinkDialog code={project.code} />
                        <Link href={`/share/${project.code}/download`} className="wk-btn">
                            下载工程 JSON
                        </Link>
                        <WkCopyButton path={`/share/${project.code}`} label="复制页面链接" variant="quiet" />
                        <Link
                            href={fastCalcUrl(project.code)}
                            target="_blank"
                            rel="noreferrer"
                            className="wk-btn wk-btn--quiet"
                        >
                            简表速览
                        </Link>
                        {isOwner && (
                            <Link href="/me" className="wk-btn wk-btn--quiet">
                                管理
                            </Link>
                        )}
                        <WkSpacer />
                        <span className="wk-meta">浏览 {formatCount(project.view_count)}</span>
                        <span className="wk-meta">克隆 {formatCount(project.clone_count)}</span>
                    </div>

                    <TeamPreview
                        slots={project.team_preview?.slots ?? []}
                        locked={project.team_preview?.locked ?? { team: false, timeline: false, calculation: false, config: false }}
                        icons={charIcons}
                        elements={elements}
                    />
                </article>
            </WkContainer>
        </WkRoot>
    )
}
