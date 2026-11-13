'use client'

// 设计系统 v2 · 浮层
// 全站只有这一套弹层：细边 + 投影 + 头/体/脚；含焦点陷阱、初焦点、Esc、关闭后归还焦点。
// 旧系统有 4 套手写弹层 + 1 套没人用的 Dialog，批次 4 统一删除。
import { useCallback, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { cn } from './cn'
import { WkButton } from './button'
import { isImeComposing } from '@/lib/keyboard'

const FOCUSABLE =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function WkDialog({
    open,
    onClose,
    title,
    children,
    footer,
    width
}: {
    open: boolean
    onClose: () => void
    title: ReactNode
    children: ReactNode
    footer?: ReactNode
    /** @default 440 */
    width?: number
}) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const titleId = useId()

    /**
     * @desc onClose 放进 ref，供 effect 内的 keydown 读最新值。
     *  调用点几乎都是内联箭头（`onClose={() => setX(false)}`），每次父组件重渲染都是新函数；
     *  如果把它写进 effect 依赖，弹窗内**每敲一个字**都会 teardown 一次 effect：
     *  清理会先把焦点还给「打开弹窗前那个元素」，再把焦点设回弹窗第一个可聚焦项 ——
     *  表现为「在第二个输入框里打字，焦点跳回第一个输入框」。
     *  所以 effect 只依赖 open，回调一律走 ref。
     */
    const onCloseRef = useRef(onClose)
    useEffect(() => {
        onCloseRef.current = onClose
    })

    // 焦点陷阱 + Esc + 关闭归还焦点 + 锁 body 滚动（只在开关时跑一次）
    useEffect(() => {
        if (!open) return
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        const frame = requestAnimationFrame(() => {
            const node = dialogRef.current
            if (!node) return
            // 里面已经有焦点了（autoFocus / 用户已经点进来）就别抢
            if (node.contains(document.activeElement)) return
            const first = node.querySelector<HTMLElement>(FOCUSABLE)
            ;(first ?? node).focus({ preventScroll: true })
        })

        function onKeyDown(event: KeyboardEvent) {
            // 输入法组合中的 Esc 只用来取消候选窗，不该顺手把弹窗关掉
            if (isImeComposing(event)) return
            if (event.key === 'Escape') {
                event.stopPropagation()
                onCloseRef.current()
                return
            }
            if (event.key !== 'Tab') return
            const node = dialogRef.current
            if (!node) return
            const items = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE))
            if (items.length === 0) return
            const first = items[0]
            const last = items[items.length - 1]
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', onKeyDown)
        return () => {
            cancelAnimationFrame(frame)
            document.body.style.overflow = previousOverflow
            document.removeEventListener('keydown', onKeyDown)
            if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true })
        }
        // 只跟开关走：onClose 走 ref，否则弹窗内每次输入都会重跑这段（抢焦点）
    }, [open])

    // 只在浏览器端挂 Portal；弹窗默认关闭，不会造成 hydration 不一致
    if (!open || typeof document === 'undefined') return null

    return createPortal(
        /* 只在「按在遮罩上」时关闭：用 pointerdown 而不是 click。
           用 click 的话，从对话框里按下、拖到遮罩上松手（选文字、拖滚动条）也会被判成点遮罩 → 误关；
           鼠标只是划过遮罩则完全不会触发（没有任何 hover 逻辑）。 */
        <div
            className="wk wk-mask"
            onPointerDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                ref={dialogRef}
                className="wk-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                style={width ? { width: `min(${width}px, 100%)` } : undefined}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <div className="wk-dialog-head" id={titleId}>
                    {title}
                </div>
                <div className="wk-dialog-body">{children}</div>
                {footer && <div className="wk-dialog-foot">{footer}</div>}
            </div>
        </div>,
        document.body
    )
}

/** @desc 破坏性操作的统一确认框。禁止再用"失焦 2s 自动撤回"这类模式 */
export function WkConfirm({
    open,
    title,
    description,
    confirmLabel = '确认',
    cancelLabel = '取消',
    tone = 'danger',
    busy = false,
    onConfirm,
    onClose
}: {
    open: boolean
    title: ReactNode
    description?: ReactNode
    confirmLabel?: string
    cancelLabel?: string
    tone?: 'danger' | 'primary'
    busy?: boolean
    onConfirm: () => void
    onClose: () => void
}) {
    return (
        <WkDialog
            open={open}
            onClose={onClose}
            title={title}
            footer={
                <>
                    <WkButton variant="quiet" onClick={onClose} disabled={busy}>
                        {cancelLabel}
                    </WkButton>
                    <WkButton variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
                        {confirmLabel}
                    </WkButton>
                </>
            }
        >
            {description && <p>{description}</p>}
        </WkDialog>
    )
}

export interface WkMenuItem {
    key: string
    label: ReactNode
    danger?: boolean
    disabled?: boolean
    onSelect: () => void
}

/** @desc 行尾 ⋯ 菜单：Esc 关闭、方向键移动、点击外部关闭 */
export function WkMenu({
    items,
    onClose,
    align = 'end'
}: {
    items: ReadonlyArray<WkMenuItem>
    onClose: () => void
    align?: 'start' | 'end'
}) {
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const el = ref.current
            if (!el) return
            // 水平夹紧：菜单默认贴触发器的左/右边缘，触发器靠近视口边缘时会有一截甩到屏幕外。
            // 量一次实际矩形，把它整体平移到视口内（左右各留 8px）；直接改 style，不触发重渲染。
            const rect = el.getBoundingClientRect()
            const vw = document.documentElement.clientWidth
            let dx = 0
            if (rect.right > vw - 8) dx = vw - 8 - rect.right
            if (rect.left + dx < 8) dx = 8 - rect.left
            if (dx !== 0) el.style.transform = `translateX(${dx}px)`
            el.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true })
        })
        function onDocPointerDown(event: MouseEvent) {
            if (ref.current?.contains(event.target as Node)) return
            onClose()
        }
        document.addEventListener('mousedown', onDocPointerDown)
        return () => {
            cancelAnimationFrame(frame)
            document.removeEventListener('mousedown', onDocPointerDown)
        }
    }, [onClose])

    const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
        if (isImeComposing(event)) return
        if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
            return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])
        if (buttons.length === 0) return
        event.preventDefault()
        const index = buttons.indexOf(document.activeElement as HTMLElement)
        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length
        buttons[next]?.focus()
    }, [onClose])

    return (
        <div
            ref={ref}
            className="wk-menu"
            role="menu"
            onKeyDown={onKeyDown}
            style={{ top: 'calc(100% + 4px)', [align === 'end' ? 'right' : 'left']: 0 }}
        >
            {items.map((item) => (
                <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    className={cn('wk-menu-item', item.danger && 'wk-menu-item--danger')}
                    onClick={() => {
                        onClose()
                        item.onSelect()
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>
    )
}
