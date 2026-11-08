import '@/design/wk-rows.css'
import '@/design/wk-overlay.css'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AdminProjects from '@/components/wk/admin-projects'
import { WkContainer, WkPageHead, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'

export const metadata: Metadata = {
    title: '工程管理'
}

export const dynamic = 'force-dynamic'

export default async function AdminProjectsPage() {
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
    if (!user) redirect('/login?redirect=/admin/projects')

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
    if (!profile?.is_admin) {
        return (
            <WkRoot>
                <WkContainer>
                    <WkPageHead title="无权限" sub="仅管理员可访问工程管理。" />
                </WkContainer>
            </WkRoot>
        )
    }

    return (
        <WkRoot>
            <WkContainer>
                <WkPageHead title="工程管理" sub="管理员可改名、调整过期时间、保护或删除任意用户的分享工程。" />
                <div style={{ marginTop: 16 }}>
                    <AdminProjects />
                </div>
            </WkContainer>
        </WkRoot>
    )
}
