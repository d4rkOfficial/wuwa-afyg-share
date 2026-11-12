import '@/design/wk-overlay.css'
import '@/design/wk-editor.css'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
// 旧内部组件（词条部位编辑器）仍依赖这份样式，只在本路由加载
import SubstatEditor from '@/components/wk/substat-editor'
import { WkContainer, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import { getEntityIcons } from '@/lib/data/avatar-icons'
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

    const { data } = await supabase
        .from('standard_substat_sets')
        .select('id, character_name, plan, note, updated_at')
        .order('character_name', { ascending: true })
    const rows = (data ?? []) as StandardSubstatSetRow[]
    // 添加角色弹窗里的头像（上游挂了降级成通用圆点，不影响编辑）
    const characterIcons = (await getEntityIcons()).character

    return (
        /* 工作台整页不滚：高度锁在一屏内，只有编辑区内部滚动（标签栏钉顶、保存条钉底） */
        <WkRoot className="wk-workbench">
            <WkContainer className="wk-workbench-in">
                <div className="wk-workbench-body">
                    <SubstatEditor
                        rows={rows}
                        isAdmin={isAdmin}
                        substatLocks={locks.substatLocks}
                        characterIcons={characterIcons}
                        title={isAdmin ? '标准词条集管理' : '标准词条集编辑'}
                        globalLocked={locks.substatSetsLocked}
                    />
                </div>
            </WkContainer>
        </WkRoot>
    )
}
