import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import SetupNotice from '@/components/setup-notice'
import SubstatSetsBrowser from '@/components/substat-sets-browser'
import { createClient, hasEnv } from '@/lib/supabase/server'
import { getViewerLocks } from '@/lib/edit-locks'
import { getEntityIcons } from '@/lib/data/avatar-icons'
import type { StandardSubstatSetRow } from '@/lib/types/db'

export const metadata: Metadata = {
    title: '标准词条集'
}

export const dynamic = 'force-dynamic'

/**
 * @desc 标准词条集浏览页（任何访客都可查看，无需登录）。
 * 编辑锁关闭时，登录用户也可以从这里进编辑页；被管理员单独锁定的角色仍只读。
 */
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
    const isAdmin = viewer.isAdmin
    const editable = !viewer.locks.substatSetsLocked
    const icons = (await getEntityIcons()).character

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4 mg-hairline">
                <div className="min-w-0">
                    <h1 className="mg-title-xl text-2xl md:text-3xl">
                        标准 14 词条
                        {editable && (
                            <span className="ml-2 align-middle text-xs font-normal text-(--accent-text)">（可编辑）</span>
                        )}
                    </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {(editable || isAdmin) && (
                        <Link
                            href={user ? '/admin/substat-sets' : '/login?redirect=/admin/substat-sets'}
                            className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors ${
                                editable
                                    ? 'border-(--accent) bg-(--accent) text-(--accent-fg) hover:brightness-110'
                                    : 'border-(--card-border) bg-(--btn-bg) text-(--btn-text) hover:bg-(--card) hover:text-(--fg)'
                            }`}
                            title={
                                editable
                                    ? '编辑锁已关闭：登录后即可编辑（被单独锁定的角色仍仅管理员可改）'
                                    : '标准词条集编辑锁开启中：仅管理员可编辑'
                            }
                        >
                            <Icon
                                icon={editable ? 'mdi:pencil-outline' : 'mdi:shield-edit-outline'}
                                className="size-4"
                            />
                            {editable ? (user ? '编辑标准词条集' : '登录后编辑') : '标准词条集管理'}
                        </Link>
                    )}
                </div>
            </div>

            {error ? (
                <div className="mg-card p-8 text-center text-(--muted)">加载失败：{error.message}</div>
            ) : rows.length === 0 ? (
                <div className="mg-card p-12 text-center">
                    <Icon icon="mdi:clipboard-text-outline" className="mx-auto mb-3 size-10 text-(--muted)" />
                    <p className="text-(--muted)">暂时还没有收录任何特殊角色的标准词条集</p>
                </div>
            ) : (
                <SubstatSetsBrowser rows={rows} icons={icons} />
            )}
        </div>
    )
}
