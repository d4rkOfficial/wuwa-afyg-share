import '@/design/wk-stats.css'
import '@/design/wk-rows.css'
import '@/design/wk-data.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import SetupNotice from '@/components/setup-notice'
import SubstatSetsBrowser from '@/components/wk/substat-sets-browser'
import { WkContainer, WkPageHead, WkRoot } from '@/design'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import { getEntityIcons } from '@/lib/data/avatar-icons'
import { CHAR_ELEMENTS } from '@/lib/data/char-elements.generated'
import type { StandardSubstatSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: '标准词条集'
}

export const dynamic = 'force-dynamic'

export default async function SubstatSetsPage() {
    if (!hasEnv()) return <SetupNotice />

    const supabase = await createClient()
    const { data, error } = await supabase
        .from('standard_substat_sets')
        .select('id, character_name, plan, note, updated_at')
        .order('character_name', { ascending: true })
    const rows = (data ?? []) as StandardSubstatSetRow[]

    const {
        data: { user }
    } = await supabase.auth.getUser()
    const viewer = await getViewerLocks()
    const editable = !viewer.locks.substatSetsLocked
    const canEdit = editable || viewer.isAdmin
    const icons = (await getEntityIcons()).character

    return (
        <WkRoot>
            <WkContainer>
                <WkPageHead
                    title="标准 14 词条"
                    sub={`特殊角色的整份声骸词条方案（主词条 + 副主词条 + 副词条），供工具箱一键同步 · 共 ${rows.length} 个角色`}
                    actions={
                        canEdit ? (
                            <Link
                                href={user ? '/edit/substat-sets' : '/login?redirect=/edit/substat-sets'}
                                className={editable ? 'wk-btn wk-btn--primary' : 'wk-btn'}
                                title={
                                    editable
                                        ? '编辑锁已关闭：登录后即可编辑（被单独锁定的角色仍仅管理员可改）'
                                        : '标准词条集编辑锁开启中：仅管理员可编辑'
                                }
                            >
                                {editable ? (user ? '编辑标准词条集' : '登录后编辑') : '标准词条集管理'}
                            </Link>
                        ) : null
                    }
                />

                <div style={{ marginTop: 16 }}>
                    {error ? (
                        <p className="wk-meta">加载失败：{error.message}</p>
                    ) : rows.length === 0 ? (
                        <p className="wk-meta" style={{ padding: '24px 0' }}>
                            暂时还没有收录任何特殊角色的标准词条集
                        </p>
                    ) : (
                        <SubstatSetsBrowser
                            rows={rows}
                            icons={icons}
                            elements={CHAR_ELEMENTS as Record<string, string>}
                        />
                    )}
                </div>
            </WkContainer>
        </WkRoot>
    )
}
