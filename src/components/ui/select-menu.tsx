'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'

export interface SelectOption {
    value: string
    label: string
}

export interface SelectGroup {
    label: string
    options: SelectOption[]
}

interface Props {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    options?: SelectOption[]
    groups?: SelectGroup[]
    icon?: string
    ariaLabel?: string
    // 顶部“全部”选项（value 为 ''），如“全部角色”
    allOption?: string
}

const PANEL_MAX_HEIGHT = 256

// 自定义下拉：Portal 到 body + fixed 定位（不被父容器裁剪、自动视口对齐，空间不足向上弹）
export default function SelectMenu({
    value,
    onChange,
    placeholder = '请选择',
    options,
    groups,
    icon,
    ariaLabel,
    allOption
}: Props) {
    const [open, setOpen] = useState(false)
    const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)

    const flatOptions: SelectOption[] = groups?.flatMap((g) => g.options) ?? options ?? []
    const current = flatOptions.find((o) => o.value === value)

    function toggleOpen() {
        if (open) {
            setOpen(false)
            return
        }
        const el = triggerRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        const width = Math.min(Math.max(r.width, 176), vw - 16)
        const left = Math.max(8, Math.min(r.left, vw - width - 8))
        const up = r.bottom + PANEL_MAX_HEIGHT > vh
        const top = up ? Math.max(8, r.top - PANEL_MAX_HEIGHT) : r.bottom
        setPos({ left, top, width, up })
        setOpen(true)
    }

    useEffect(() => {
        if (!open) return
        function onDocMouseDown(e: MouseEvent) {
            if (triggerRef.current?.contains(e.target as Node)) return
            if (panelRef.current?.contains(e.target as Node)) return
            setOpen(false)
        }
        function onDocKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false)
        }
        function onScroll(e: Event) {
            // 面板自身滚动不关闭，仅页面/外部滚动关闭
            const target = e.target as Node
            if (panelRef.current?.contains(target)) return
            setOpen(false)
        }
        document.addEventListener('mousedown', onDocMouseDown)
        document.addEventListener('keydown', onDocKey)
        window.addEventListener('scroll', onScroll, true)
        return () => {
            document.removeEventListener('mousedown', onDocMouseDown)
            document.removeEventListener('keydown', onDocKey)
            window.removeEventListener('scroll', onScroll, true)
        }
    }, [open])

    function select(next: string) {
        onChange(next)
        setOpen(false)
    }

    const panel = (
        <div
            ref={panelRef}
            role="listbox"
            className="overflow-y-auto rounded-lg border p-1 shadow-xl"
            style={{
                position: 'fixed',
                left: pos?.left ?? 0,
                top: pos?.top ?? 0,
                width: pos?.width ?? 176,
                maxHeight: PANEL_MAX_HEIGHT,
                zIndex: 60,
                background: 'var(--bg)',
                borderColor: 'var(--card-border)'
            }}
        >
            {allOption && (
                <SelectItem opt={{ value: '', label: allOption }} selected={value === ''} onSelect={select} />
            )}
            {groups?.map((group) => (
                <div key={group.label}>
                    <div className="px-2.5 py-1 text-[10px] font-medium text-(--muted)">{group.label}</div>
                    {group.options.map((opt) => (
                        <SelectItem key={opt.value} opt={opt} selected={opt.value === value} onSelect={select} />
                    ))}
                </div>
            ))}
            {!groups &&
                (options ?? []).map((opt) => (
                    <SelectItem key={opt.value} opt={opt} selected={opt.value === value} onSelect={select} />
                ))}
        </div>
    )

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={toggleOpen}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={ariaLabel}
                className="flex h-full w-full min-w-0 items-center gap-1.5 rounded-lg border border-(--card-border) bg-(--input-bg) px-2.5 text-sm font-medium text-(--fg) outline-none transition-[border-color,box-shadow] duration-200 focus:border-(--accent)/60 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_10%,transparent)]"
            >
                {icon && <Icon icon={icon} className="size-4 shrink-0 text-(--muted)" />}
                <span className={`min-w-0 flex-1 truncate text-left ${current ? '' : 'text-(--muted)'}`}>
                    {current?.label ?? placeholder}
                </span>
                <Icon
                    icon="mdi:chevron-down"
                    className={`size-4 shrink-0 text-(--muted) transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {open && pos && typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
        </>
    )
}

function SelectItem({
    opt,
    selected,
    onSelect
}: {
    opt: SelectOption
    selected: boolean
    onSelect: (value: string) => void
}) {
    return (
        <button
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(opt.value)}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
                selected ? 'bg-(--accent)/15 font-medium text-(--accent-text)' : 'text-(--fg) hover:bg-(--card-hover)'
            }`}
        >
            <span className="min-w-0 flex-1 truncate">{opt.label}</span>
            {selected && <Icon icon="mdi:check" className="size-3.5 shrink-0" />}
        </button>
    )
}
