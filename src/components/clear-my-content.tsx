'use client'

// 清空我的全部工程：二次确认弹窗，需输入「确认删除」才可执行。
// 保护工程不受影响。

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { toast } from '@/components/ui/toast'
import { deleteMyContent } from '@/lib/actions/project-protection'

const CONFIRM_TEXT = '确认删除'

export default function ClearMyContent() {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [input, setInput] = useState('')
    const [pending, startTransition] = useTransition()

    function onConfirm() {
        startTransition(async () => {
            const res = await deleteMyContent()
            if (res.error) {
                toast(res.error, 'error')
                return
            }
            toast(`已删除 ${res.data?.deletedProjects ?? 0} 个工程（保护工程保留）`, 'success')
            setOpen(false)
            setInput('')
            router.refresh()
        })
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/20"
            >
                <Icon icon="mdi:delete-sweep-outline" className="size-4" />
                清空我的全部内容
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
                    <div className="relative w-full max-w-md rounded-xl border border-(--card-border) bg-(--card) p-5 shadow-2xl">
                        <div className="flex items-center gap-2">
                            <Icon icon="mdi:alert-decagram-outline" className="size-5 text-red-400" />
                            <h3 className="text-sm font-semibold">确认清空我的全部内容？</h3>
                        </div>
                        <p className="mt-2 text-sm text-(--muted)">
                            将删除我发布的<strong className="text-(--fg)">全部工程</strong>，删除后无法恢复。
                            <strong className="text-(--fg)">保护状态的工程不受影响</strong>。
                        </p>
                        <p className="mt-2 text-xs text-(--muted)">
                            请输入 <span className="font-mono text-(--accent-text)">{CONFIRM_TEXT}</span> 以确认：
                        </p>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={CONFIRM_TEXT}
                            className="mt-2 w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2 text-sm outline-none transition-colors focus:border-(--danger)/60"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setOpen(false)
                                    setInput('')
                                }}
                                className="rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) hover:text-(--fg)"
                            >
                                取消
                            </button>
                            <button
                                onClick={onConfirm}
                                disabled={pending || input !== CONFIRM_TEXT}
                                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:brightness-110 disabled:opacity-50"
                            >
                                <Icon icon={pending ? 'mdi:loading' : 'mdi:delete-sweep-outline'} className={`size-4 ${pending ? 'animate-spin' : ''}`} />
                                确认清空
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
