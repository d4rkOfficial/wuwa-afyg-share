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
    title: 'AI 控制台'
}

export const dynamic = 'force-dynamic'

/**
 * @desc 普通登录用户的 AI 控制台（DSH 风格，占满标题栏以下）。
 *  - 未登录 → 登录页
 *  - 管理员 → /agent/admin（能力更大，别让管理员用受限版）
 *  - 权限：只能改「未被锁定」的 Buff 实体（工具层 + 服务端各拦一次）
 */
export default async function AgentUserPage() {
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
    if (!user) redirect('/login?redirect=/agent/user')

    const viewer = await getViewerLocks()
    if (viewer.isAdmin) redirect('/agent/admin')

    return (
        <WkRoot>
            <AgentConsole role="user" locks={viewer.locks} userId={user.id} />
        </WkRoot>
    )
}
