'use client'

// 首页底部（全站 footer）的「编辑锁」开关：仅管理员可见。
// 两个域各一把：Buff 集 / 标准词条集。关闭 = 登录用户都能编辑；开启 = 仅管理员（现状）。
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { setEditLock } from '@/lib/actions/edit-locks'
import { toast } from '@/components/ui/toast'
import type { EditScope } from '@/lib/types/db'

interface Props {
    buffSetsLocked: boolean
    substatSetsLocked: boolean
}

interface Row {
    scope: EditScope
    label: string
    hint: string
}

const ROWS: Row[] = [
    { scope: 'buff_sets', label: 'Buff 集', hint: '条目级锁在编辑页逐个实体设置' },
    { scope: 'substat_sets', label: '标准词条集', hint: '条目级锁在编辑页逐个角色设置' }
]

export default function EditLockSwitch({ buffSetsLocked, substatSetsLocked }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [locks, setLocks] = useState<Record<EditScope, boolean>>({
        buff_sets: buffSetsLocked,
        substat_sets: substatSetsLocked
    })

    function toggle(scope: EditScope) {
        const next = !locks[scope]
        // 乐观更新：失败回滚并提示
        setLocks((prev) => ({ ...prev, [scope]: next }))
        startTransition(async () => {
            const res = await setEditLock(scope, next)
            if (res.error) {
                setLocks((prev) => ({ ...prev, [scope]: !next }))
                toast(res.error, 'error')
                return
            }
            toast(next ? '已开启编辑锁：仅管理员可编辑' : '已关闭编辑锁：登录用户可编辑', 'success')
            router.refresh()
        })
    }

    return (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-(--muted)">
                <Icon icon="mdi:lock-outline" className="size-3.5" />
                编辑锁
            </span>
            {ROWS.map((row) => {
                const locked = locks[row.scope]
                return (
                    <button
                        key={row.scope}
                        type="button"
                        onClick={() => toggle(row.scope)}
                        disabled={pending}
                        title={
                            locked
                                ? `「${row.label}」当前仅管理员可编辑；点击对登录用户开放（${row.hint}）`
                                : `「${row.label}」当前对登录用户开放；点击收回为仅管理员可编辑（${row.hint}）`
                        }
                        className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 transition-colors disabled:opacity-60 ${
                            locked
                                ? 'border-(--card-border) text-(--muted) hover:text-(--fg)'
                                : 'border-(--accent) text-(--accent-text)'
                        }`}
                        aria-pressed={!locked}
                    >
                        <Icon icon={locked ? 'mdi:lock' : 'mdi:lock-open-variant'} className="size-3.5" />
                        <span>{row.label}</span>
                        <span className="text-[10px] opacity-70">{locked ? '仅管理员' : '可编辑'}</span>
                    </button>
                )
            })}
        </div>
    )
}
