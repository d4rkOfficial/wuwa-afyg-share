'use client'

// 顶栏「编辑锁」：原来挂在页脚，但被 fixed 外壳盖住、且在需要它的页面不可达。
// 现在放顶栏右侧（仅管理员）：一个锁图标 + 有锁定生效时的小圆点，点开是两把锁的开关。
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { WkIconButton, WkSwitch, wkToast } from '@/design'
import { setEditLock } from '@/lib/actions/edit-locks'
import { isImeComposing } from '@/lib/keyboard'
import type { EditScope } from '@/lib/types/db'

const ROWS: Array<{ scope: EditScope; label: string; hint: string }> = [
    { scope: 'buff_sets', label: 'Buff 集', hint: '条目级锁在编辑页逐个实体设置' },
    { scope: 'substat_sets', label: '标准词条集', hint: '条目级锁在编辑页逐个角色设置' }
]

export default function WkLockPopover({
    buffSetsLocked,
    substatSetsLocked
}: {
    buffSetsLocked: boolean
    substatSetsLocked: boolean
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [pending, startTransition] = useTransition()
    const [locks, setLocks] = useState<Record<EditScope, boolean>>({
        buff_sets: buffSetsLocked,
        substat_sets: substatSetsLocked
    })
    const wrapRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        function onDown(event: MouseEvent) {
            if (wrapRef.current?.contains(event.target as Node)) return
            setOpen(false)
        }
        function onKey(event: KeyboardEvent) {
            if (isImeComposing(event)) return
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    const anyLocked = locks.buff_sets || locks.substat_sets

    function toggle(scope: EditScope) {
        const next = !locks[scope]
        setLocks((prev) => ({ ...prev, [scope]: next }))
        startTransition(async () => {
            const result = await setEditLock(scope, next)
            if (result.error) {
                setLocks((prev) => ({ ...prev, [scope]: !next }))
                wkToast(result.error, 'error')
                return
            }
            wkToast(next ? '已锁定：仅管理员可编辑' : '已开放：登录用户可编辑', 'ok')
            router.refresh()
        })
    }

    return (
        <div className="wk-pop" ref={wrapRef}>
            <WkIconButton
                label="编辑锁"
                variant="quiet"
                size="sm"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
            >
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <Icon
                        icon={anyLocked ? 'mdi:lock-outline' : 'mdi:lock-open-variant-outline'}
                        className="wk-nav-icon"
                        aria-hidden="true"
                    />
                    {anyLocked && <span className="wk-lockdot" aria-hidden="true" />}
                </span>
            </WkIconButton>

            {open && (
                <div className="wk-pop-panel" role="dialog" aria-label="编辑锁">
                    <div className="wk-label" style={{ paddingBottom: 8, borderBottom: '1px solid var(--wk-line)' }}>
                        编辑锁 · 仅管理员
                    </div>
                    {ROWS.map((row) => {
                        const locked = locks[row.scope]
                        return (
                            <div className="wk-pop-row" key={row.scope}>
                                <WkSwitch
                                    checked={locked}
                                    onChange={() => toggle(row.scope)}
                                    label={`${row.label}锁定`}
                                    disabled={pending}
                                />
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 'var(--wk-t-body)' }}>{row.label}</div>
                                    <div className="wk-meta">
                                        {locked ? '当前仅管理员可编辑' : '当前登录用户可编辑'} · {row.hint}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                    <div className="wk-meta" style={{ paddingTop: 8 }}>
                        锁状态对所有访客生效。
                    </div>
                </div>
            )}
        </div>
    )
}
