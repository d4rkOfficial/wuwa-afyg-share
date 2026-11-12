import '@/design/wk-overlay.css'
import '@/design/wk-editor.css'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
// 旧内部组件（Buff 编辑器本体与弹窗）仍依赖这份样式，只在本路由加载
import BuffEditor from '@/components/wk/buff-editor'
import BuffSnapshotPanel from '@/components/admin/buff-snapshot-panel'
import { WkContainer, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import { getEntityIcons } from '@/lib/data/avatar-icons'
import type { BuffFolderRow, BuffSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: 'Buff 集编辑'
}

export const dynamic = 'force-dynamic'

export default async function EditBuffSetsPage() {
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
    if (!user) redirect('/login?redirect=/edit/buff-sets')

    const { isAdmin, locks } = await getViewerLocks()
    const canEdit = isAdmin || !locks.buffSetsLocked
    if (!canEdit) {
        return (
            <WkRoot>
                <WkContainer>
                    <p className="wk-meta" style={{ padding: '24px 0' }}>
                        Buff 集编辑当前处于锁定状态（仅管理员可编辑）。需要编辑请联系管理员，或在顶栏的编辑锁里关闭它。
                    </p>
                </WkContainer>
            </WkRoot>
        )
    }

    const [{ data }, { data: folderData }] = await Promise.all([
        supabase
            .from('buff_sets')
            .select('id, entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set, sort_order')
            .order('entity_type', { ascending: true })
            .order('entity_name', { ascending: true })
            .order('sort_order', { ascending: true }),
        supabase
            .from('buff_folders')
            .select('id, entity_type, entity_name, name, sort_order')
            .order('sort_order', { ascending: true })
    ])
    const rows = (data ?? []) as BuffSetRow[]
    const folders = (folderData ?? []) as BuffFolderRow[]
    // 实体图标：打开实体弹窗每行左侧的头像（上游挂了会降级成通用图标，不影响编辑）
    const entityIcons = await getEntityIcons()

    return (
        /* 工作台整页不滚：高度锁在一屏内，只有编辑卡内部滚动（标签栏钉顶、保存条钉底）。
           页面不再有标题块：快照入口挂在标签栏右端，编辑区占满顶栏以下。 */
        <WkRoot className="wk-workbench">
            <WkContainer className="wk-workbench-in">
                <div className="wk-workbench-body">
                    <BuffEditor
                        rows={rows}
                        folders={folders}
                        isAdmin={isAdmin}
                        buffLocks={locks.buffLocks}
                        entityIcons={entityIcons}
                        actions={isAdmin ? <BuffSnapshotPanel /> : undefined}
                    />
                </div>
            </WkContainer>
        </WkRoot>
    )
}
