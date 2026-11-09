'use client'

// 自定义下拉（不用原生 <select>）
// - 触发器就是一个带描边的按钮，外观与 .wk-select 一致（同高、同圆角、同描边对比度）
// - 面板走 Portal + fixed 定位，自动向上/向下翻转，不被父容器裁切
// - 键盘：↑/↓ 移动、Home/End 首尾、Enter 选中、Esc 关闭；aria-activedescendant 指向当前项
// - 支持分组（如角色按属性分组）
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'
import type { CSSProperties, ReactNode } from 'react'
import { isImeComposing } from '@/lib/keyboard'

export interface WkDropdownOption {
    value: string
    label: ReactNode
    /** 选项前的色点（如角色属性色） */
    tone?: string
    hint?: ReactNode
}

export interface WkDropdownGroup {
    label?: string
    options: WkDropdownOption[]
}

const PANEL_MAX = 288

export function WkDropdown({
    value,
    onChange,
    options,
    groups,
    placeholder = '请选择',
    ariaLabel,
    leading,
    disabled = false,
    size = 'md',
    width
}: {
    value: string
    onChange: (next: string) => void
    options?: ReadonlyArray<WkDropdownOption>
    groups?: ReadonlyArray<WkDropdownGroup>
    placeholder?: string
    ariaLabel?: string
    leading?: ReactNode
    disabled?: boolean
    size?: 'md' | 'sm'
    width?: number
}) {
    const [open, setOpen] = useState(false)
    const [active, setActive] = useState(0)
    const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const listId = useId()

    const flat = useMemo<WkDropdownOption[]>(() => {
        if (groups) return groups.flatMap((group) => group.options)
        return options ? [...options] : []
    }, [groups, options])

    const current = flat.find((opt) => opt.value === value)

    const openPanel = useCallback(() => {
        const el = triggerRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const panelWidth = Math.min(Math.max(width ?? rect.width, 200), vw - 16)
        const left = Math.max(8, Math.min(rect.left, vw - panelWidth - 8))
        const up = rect.bottom + PANEL_MAX > vh
        const top = up ? Math.max(8, rect.top - PANEL_MAX) : rect.bottom + 4
        setPos({ left, top, width: panelWidth, up })
        setActive(Math.max(0, flat.findIndex((opt) => opt.value === value)))
        setOpen(true)
    }, [flat, value, width])

    useEffect(() => {
        if (!open) return
        function onPointerDown(event: MouseEvent) {
            const target = event.target as Node
            if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
            setOpen(false)
        }
        function onScroll(event: Event) {
            const target = event.target as Node | null
            if (panelRef.current && target === panelRef.current) return
            setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown)
        window.addEventListener('scroll', onScroll, true)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            window.removeEventListener('scroll', onScroll, true)
        }
    }, [open])

    function commit(option: WkDropdownOption) {
        onChange(option.value)
        setOpen(false)
        triggerRef.current?.focus()
    }

    function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
        if (disabled) return
        // 组合输入中的按键属于输入法候选窗，不参与下拉的键盘导航（否则 Enter/Space 会被这里抢走）
        if (isImeComposing(event)) return
        if (!open) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                openPanel()
            }
            return
        }
        if (event.key === 'Escape') {
            event.preventDefault()
            setOpen(false)
            return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            const step = event.key === 'ArrowDown' ? 1 : -1
            setActive((index) => (index + step + flat.length) % flat.length)
            return
        }
        if (event.key === 'Home') {
            event.preventDefault()
            setActive(0)
            return
        }
        if (event.key === 'End') {
            event.preventDefault()
            setActive(flat.length - 1)
            return
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            const option = flat[active]
            if (option) commit(option)
        }
    }

    const panel =
        open && pos && typeof document !== 'undefined'
            ? createPortal(
                  <div
                      ref={panelRef}
                      className="wk-dd-panel"
                      role="listbox"
                      id={listId}
                      aria-label={ariaLabel}
                      style={{ left: pos.left, top: pos.top, width: pos.width } as CSSProperties}
                  >
                      {groups
                          ? groups.map((group, groupIndex) =>
                                group.options.length === 0 ? null : (
                                    <div key={group.label ?? groupIndex}>
                                        {group.label && <div className="wk-dd-group">{group.label}</div>}
                                        {group.options.map((option) => {
                                            const index = flat.indexOf(option)
                                            return (
                                                <button
                                                    key={`${group.label ?? groupIndex}-${option.value}`}
                                                    type="button"
                                                    role="option"
                                                    id={`${listId}-${index}`}
                                                    aria-selected={option.value === value}
                                                    data-active={index === active}
                                                    className="wk-dd-option"
                                                    onMouseEnter={() => setActive(index)}
                                                    onClick={() => commit(option)}
                                                >
                                                    {option.tone && (
                                                        <span
                                                            className="wk-dd-dot"
                                                            style={{ color: option.tone }}
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                    <span className="wk-dd-option-label">{option.label}</span>
                                                    {option.hint && <span className="wk-meta">{option.hint}</span>}
                                                    {option.value === value && (
                                                        <Icon icon="mdi:check" className="wk-dd-check" aria-hidden="true" />
                                                    )}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )
                          )
                          : flat.map((option, index) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="option"
                                    id={`${listId}-${index}`}
                                    aria-selected={option.value === value}
                                    data-active={index === active}
                                    className="wk-dd-option"
                                    onMouseEnter={() => setActive(index)}
                                    onClick={() => commit(option)}
                                >
                                    {option.tone && (
                                        <span className="wk-dd-dot" style={{ color: option.tone }} aria-hidden="true" />
                                    )}
                                    <span className="wk-dd-option-label">{option.label}</span>
                                    {option.hint && <span className="wk-meta">{option.hint}</span>}
                                    {option.value === value && (
                                        <Icon icon="mdi:check" className="wk-dd-check" aria-hidden="true" />
                                    )}
                                </button>
                            ))}
                  </div>,
                  document.body
              )
            : null

    return (
        <div className="wk-dd" style={width ? { width } : undefined}>
            <button
                ref={triggerRef}
                type="button"
                className="wk-dd-trigger"
                role="combobox"
                data-size={size}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                aria-label={ariaLabel}
                aria-activedescendant={open && flat[active] ? `${listId}-${active}` : undefined}
                onClick={() => (open ? setOpen(false) : openPanel())}
                onKeyDown={onKeyDown}
            >
                {leading && <span className="wk-dd-leading">{leading}</span>}
                <span className="wk-dd-value" data-placeholder={!current}>
                    {current ? current.label : placeholder}
                </span>
                <Icon icon="mdi:chevron-down" className="wk-dd-chevron" aria-hidden="true" />
            </button>
            {panel}
        </div>
    )
}
