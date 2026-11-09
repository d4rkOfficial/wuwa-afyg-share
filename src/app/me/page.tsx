import '@/design/wk-overlay.css'
import '@/design/wk-plaza.css'
import '@/design/wk-me.css'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import MeProjects from '@/components/wk/me-projects'
import AccountPanel from '@/components/wk/account-panel'
import { WkContainer, WkPageHead, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getAvatarIcons } from '@/lib/data/avatar-icons'
import { CHAR_ELEMENTS } from '@/lib/data/char-elements.generated'
import { LIST_COLUMNS } from '@/lib/project/query'
import { isExpiredProject, isGracePeriod } from '@/lib/utils/expiry'
import { avatarPool } from '@/lib/utils/avatar'
import type { ProjectListItem } from '@/lib/types/db'

export const metadata: Metadata = {
    title: '我的工程'
}

export const dynamic = 'force-dynamic'

export default async function MePage() {
    if (!hasEnv()) {
        return (
            <WkRoot>
                <WkContainer>
                    <p className="wk-meta">服务未配置</p>
                </WkContainer>
            </WkRoot>
        )
    }

    const supabase = await createClient()
    const {
        data: { user }
    } = await supabase.auth.getUser()
    if (!user) redirect('/login?redirect=/me')

    const { data } = await supabase
        .from('projects')
        .select(LIST_COLUMNS)
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
    const projects = (data ?? []) as ProjectListItem[]
    const expiredCount = projects.filter(
        (project) => isExpiredProject(project.expires_at, project.author_name) || isGracePeriod(project.expires_at, project.author_name)
    ).length
    const totalClones = projects.reduce((sum, project) => sum + (project.clone_count ?? 0), 0)

    const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle()
    if (!profile?.username) redirect('/setup-username?redirect=/me')

    const icons = await getAvatarIcons()
    const avatarPoolUrls = avatarPool(icons)

    return (
        <WkRoot>
            <WkContainer>
                <WkPageHead
                    title="我的工程"
                    sub="点标题进分享页；「编辑」里可改标题 / 简介 / 标签 / 有效期，以及换码 / 换源 / 保护 / 删除。"
                />

                <div className="wk-me-layout" style={{ marginTop: 20 }}>
                    {/* 有工程时左栏粘住（长列表滚动不带走账号卡）；空态时拉伸到与右栏等高，两卡下沿对齐 */}
                    <div className={projects.length === 0 ? 'wk-me-side wk-me-side--fill' : 'wk-me-side wk-me-side--sticky'}>
                        <AccountPanel
                            username={profile.username}
                            avatarPool={avatarPoolUrls}
                            stats={[
                                { label: '上传数', value: projects.length },
                                { label: '下载量', value: totalClones }
                            ]}
                        />
                    </div>
                    <div style={{ minWidth: 0, display: 'grid', gap: 12, alignContent: 'start' }}>
                        <div className="wk-section-head" style={{ marginBottom: 0 }}>
                            <h2 style={{ fontSize: 'var(--wk-t-sec)' }}>我的工程</h2>
                            <span className="wk-meta">
                                共 {projects.length} 个{expiredCount > 0 ? ` · ${expiredCount} 个已过期` : ''}
                            </span>
                        </div>
                        <MeProjects projects={projects} elements={CHAR_ELEMENTS as Record<string, string>} />
                    </div>
                </div>
            </WkContainer>
        </WkRoot>
    )
}
