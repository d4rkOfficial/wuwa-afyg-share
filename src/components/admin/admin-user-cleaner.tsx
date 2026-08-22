'use client'

// 管理员「按用户删除」工具：删除某用户全部工程（保护工程豁免）。
// 二次确认：需输入目标用户名才可执行。

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { toast } from '@/components/ui/toast'
import { adminUserSummary, adminDeleteUserContent } from '@/lib/actions/project-protection'

export default function AdminUserCleaner() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [username, setUsername] = useState('')
    const [summary, setSummary] = useState<{ username: string; projectCount: number } | null>(null)
    const [confirmText, setConfirmText] = useState('')
    const [pending, startTransition] = useTransition()

    function onLookup() {
        if (!username.trim()) return
        startTransition(async () => {
            const res = await adminUserSummary(username)
            if (res.error) {
                toast(res.error, 'error')
                setSummary(null)
                return
            }
            setSummary(res.data ?? null)
            setConfirmText('')
        })
    }

    function onConfirm() {
        if (!summary || confirmText !== summary.username) return
        startTransition(async () => {
            const res = await adminDeleteUserContent(summary.username)
            if (res.error) {
                toast(res.error, 'error')
                return
            }
            toast(`已删除 ${res.data?.deletedProjects ?? 0} 个工程（保护工程保留）`, 'success')
            setOpen(false)
            setUsername('')
            setSummary(null)
            setConfirmText('')
            router.refresh()
        })
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="toolbar-btn toolbar-btn-ghost text-(--danger) hover:text-(--danger)"
            >
                <span className="flex items-center gap-1.5">
                    <Icon icon="mdi:account-remove-outline" className="size-4" />
                    按用户删除
                </span>
                <Icon icon="mdi:account-remove" className="size-4" />
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 " onClick={() => setOpen(false)} />
                    <div className="relative w-full max-w-md rounded-none border-2 border-(--card-border) bg-(--card) p-5 ">
                        <div className="flex items-center gap-2">
                            <Icon icon="mdi:alert-decagram-outline" className="size-5 text-(--danger)" />
                            <h3 className="text-sm font-semibold">按用户删除全部内容</h3>
                        </div>
                        <p className="mt-2 text-sm text-(--muted)">
                            删除该用户发布的<strong className="text-(--fg)">全部工程</strong>，删除后无法恢复；
                            <strong className="text-(--fg)">保护状态的工程不受影响</strong>。
                        </p>

                        <div className="mt-3 flex gap-2">
                            <input
                                value={username}
                                onChange={(e) => {
                                    setUsername(e.target.value)
                                    setSummary(null)
                                }}
                                placeholder="输入目标用户名"
                                className="w-full rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm outline-none transition-colors focus:border-(--accent)"
                            />
                            <button
                                onClick={onLookup}
                                disabled={pending || !username.trim()}
                                className="shrink-0 rounded-none border-2 border-(--card-border) px-3 py-2 text-sm text-(--muted) transition-colors hover:text-(--fg) disabled:opacity-50"
                            >
                                查询
                            </button>
                        </div>

                        {summary && (
                            <div className="mt-3 rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm">
                                <p>
                                    用户 <span className="font-medium text-(--fg)">{summary.username}</span>：
                                    <span className="text-(--fg)">{summary.projectCount}</span> 个工程
                                </p>
                                <p className="mt-1 text-xs text-(--muted)">
                                    请输入该用户名以确认删除：
                                </p>
                                <input
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder={summary.username}
                                    className="mt-1 w-full rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-1.5 text-sm outline-none transition-colors focus:border-(--danger)"
                                />
                            </div>
                        )}

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setOpen(false)
                                    setUsername('')
                                    setSummary(null)
                                    setConfirmText('')
                                }}
                                className="rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) hover:text-(--fg)"
                            >
                                取消
                            </button>
                            <button
                                onClick={onConfirm}
                                disabled={pending || !summary || confirmText !== summary.username}
                                className="inline-flex items-center gap-1 rounded-none border-2 border-(--danger) bg-(--danger) transition-colors hover:bg-(--card) hover:text-(--danger) px-3 py-1.5 text-sm text-white  disabled:opacity-50"
                            >
                                <Icon icon={pending ? 'mdi:loading' : 'mdi:account-remove-outline'} className={`size-4 ${pending ? 'animate-spin' : ''}`} />
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
