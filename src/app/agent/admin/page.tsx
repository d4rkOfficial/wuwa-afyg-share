import '@/design/wk-editor.css'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
// AI 控制台自带的样式（.agent-*）只在本路由加载
import '@/components/agent.css'
import AgentConsole from '@/components/agent/agent-console'
import { WkContainer, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'

export const metadata: Metadata = {
    title: 'AI 控制台（管理员）'
}

export const dynamic = 'force-dynamic'

/**
 * @desc 管理员 AI 控制台（DSH 风格，占满标题栏以下的整块区域）。
 *  - 未登录 → 登录页（回跳这里）
 *  - 已登录但非管理员 → /agent/user（同一套控制台，权限更小）
 */
export default async function AgentAdminPage() {
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
    if (!user) redirect('/login?redirect=/agent/admin')

    const viewer = await getViewerLocks()
    if (!viewer.isAdmin) redirect('/agent/user')

    // 控制台自带固定布局；这里只把它纳入 .wk 作用域，配色随之统一为刊物令牌
    return (
        <WkRoot>
            <AgentConsole role="admin" locks={viewer.locks} userId={user.id} />
        </WkRoot>
    )
}
