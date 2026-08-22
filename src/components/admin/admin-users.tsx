'use client'

// 管理员权限链管理：授权（按用户名）、撤销（仅授出者，连坐收回）、权限树展示。

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { toast } from '@/components/ui/toast'
import { adminGrantAdmin, adminRevokeAdmin } from '@/lib/actions/admin-users'

export interface AdminViewItem {
    id: string
    username: string
    grantedBy: string | null // 授权者用户名；null = 根管理员（不可撤销）
    grantedByMe: boolean
}

interface Props {
    admins: AdminViewItem[]
}

export default function AdminUsers({ admins }: Props) {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [pending, startTransition] = useTransition()
    const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)

    function run(fn: () => Promise<{ error?: string; data?: { message?: string } } | undefined>) {
        startTransition(async () => {
            const res = await fn()
            if (res?.error) {
                toast(res.error, 'error')
                return
            }
            if (res?.data?.message) toast(res.data.message, 'success')
            setConfirmRevoke(null)
            router.refresh()
        })
    }

    function onGrant() {
        const name = username.trim()
        if (!name) return
        run(() => adminGrantAdmin(name))
        setUsername('')
    }

    function onRevoke(username: string) {
        run(() => adminRevokeAdmin(username))
    }

    return (
        <div className="space-y-4">
            {/* 授权表单 */}
            <div className="rounded-none border-2 border-(--card-border) bg-(--card) p-4">
                <div className="flex items-center gap-2">
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && onGrant()}
                        placeholder="输入用户名授予管理员权限"
                        className="w-full rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm outline-none transition-colors focus:border-(--accent)"
                    />
                    <button
                        onClick={onGrant}
                        disabled={pending || !username.trim()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-none px-4 py-2 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all  disabled:opacity-50"
                    >
                        <Icon icon={pending ? 'mdi:loading' : 'mdi:shield-plus-outline'} className={`size-4 ${pending ? 'animate-spin' : ''}`} />
                        授权
                    </button>
                </div>
                <p className="mt-2 text-xs text-(--muted)">
                    该用户需已设置用户名（登录过一次）。授权后立即生效，无需重新登录。
                </p>
            </div>

            {/* 管理员列表 */}
            <div className="overflow-hidden rounded-none border-2 border-(--card-border) bg-(--card)">
                <div className="border-b-2 border-(--card-border) px-4 py-2.5 text-xs text-(--muted)">共 {admins.length} 位管理员</div>
                {admins.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-(--muted)">暂无管理员（请通过 SQL 引导首位根管理员）</p>
                )}
                {admins.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 border-b-2 border-(--card-border) px-4 py-3 last:border-0">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-(--fg)">{a.username}</span>
                                {a.grantedBy === null ? (
                                    <span className="inline-flex items-center gap-1 rounded-none bg-(--accent) px-1.5 py-0.5 text-[10px] text-(--accent-fg)">
                                        <Icon icon="mdi:shield-key-outline" className="size-3" />
                                        根管理员
                                    </span>
                                ) : (
                                    <span className="rounded-none bg-(--card-hover) px-1.5 py-0.5 text-[10px] text-(--muted)">
                                        由 {a.grantedBy} 授权
                                    </span>
                                )}
                                {a.grantedByMe && (
                                    <span className="rounded-none border-2 border-(--success) px-1.5 py-0.5 text-[10px] text-(--success)">
                                        我授权的
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-(--muted)">
                                {a.grantedBy === null
                                    ? '根管理员不可通过本页撤销（需 SQL 操作）'
                                    : a.grantedByMe
                                      ? '您可以收回这份授权，其授出的权限将一并收回'
                                      : '仅授权者可收回这份授权'}
                            </p>
                        </div>
                        {a.grantedByMe &&
                            (confirmRevoke === a.id ? (
                                <button
                                    onClick={() => onRevoke(a.username)}
                                    disabled={pending}
                                    className="shrink-0 rounded-none border-2 border-(--danger) bg-(--danger) transition-colors hover:bg-(--card) hover:text-(--danger) px-3 py-1.5 text-xs text-white  disabled:opacity-50"
                                >
                                    确认撤销（连坐收回）
                                </button>
                            ) : (
                                <button
                                    onClick={() => setConfirmRevoke(a.id)}
                                    onBlur={() => setTimeout(() => setConfirmRevoke(null), 2500)}
                                    disabled={pending}
                                    className="shrink-0 rounded-none border-2 border-(--danger) bg-(--card) px-3 py-1.5 text-xs text-(--danger) transition-colors hover:bg-(--danger) hover:text-white disabled:opacity-50"
                                >
                                    撤销
                                </button>
                            ))}
                    </div>
                ))}
            </div>
        </div>
    )
}
