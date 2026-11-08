import '@/design/wk-overlay.css'
import '@/design/wk-editor.css'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
// 旧内部组件（词条部位编辑器）仍依赖这份样式，只在本路由加载
import SubstatEditor from '@/components/wk/substat-editor'
import { WkContainer, WkPageHead, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import type { StandardSubstatSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: '标准词条集编辑'
}

export const dynamic = 'force-dynamic'

export default async function EditSubstatSetsPage() {
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
    if (!user) redirect('/login?redirect=/edit/substat-sets')

    const { isAdmin, locks } = await getViewerLocks()
    const canEdit = isAdmin || !locks.substatSetsLocked
    if (!canEdit) {
        return (
            <WkRoot>
                <WkContainer>
                    <WkPageHead
                        title="无权限"
                        sub="标准词条集编辑当前处于锁定状态（仅管理员可编辑）。需要编辑请联系管理员，或在顶栏的编辑锁里关闭它。"
                    />
                </WkContainer>
            </WkRoot>
        )
    }

    const { data } = await supabase
        .from('standard_substat_sets')
        .select('id, character_name, plan, note, updated_at')
        .order('character_name', { ascending: true })
    const rows = (data ?? []) as StandardSubstatSetRow[]

    return (
        <WkRoot>
            <WkContainer>
                <WkPageHead
                    title={isAdmin ? '标准词条集管理' : '标准词条集编辑'}
                    sub="顶部下拉切换角色；改完在底部保存条点保存。备注会展示在浏览页。"
                />
                <div style={{ marginTop: 20 }}>
                    <SubstatEditor rows={rows} isAdmin={isAdmin} substatLocks={locks.substatLocks} />
                </div>
            </WkContainer>
        </WkRoot>
    )
}
