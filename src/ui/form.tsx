'use client'

// 设计系统原语 · 表单（保留 API，输出 .wk-* 类）
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

export function Field({
    label,
    hint,
    aside,
    children,
    className = ''
}: {
    label?: ReactNode
    hint?: ReactNode
    /** @desc label 右侧的附加内容（计数、重置按钮等） */
    aside?: ReactNode
    children: ReactNode
    className?: string
}) {
    return (
        <label className={`wk-field ${className}`}>
            {(label || aside) && (
                <span className="wk-field-label" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <span>{label}</span>
                    {aside}
                </span>
            )}
            {children}
            {hint && <span className="wk-field-hint">{hint}</span>}
        </label>
    )
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={`wk-input ${className}`} {...rest} />
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={`wk-textarea ${className}`} {...rest} />
}

export function Select({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select className={`wk-select ${className}`} {...rest}>
            {children}
        </select>
    )
}

export function Switch({
    checked,
    onChange,
    label,
    disabled
}: {
    checked: boolean
    onChange: (next: boolean) => void
    label: string
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            title={label}
            disabled={disabled}
            className="wk-switch"
            data-on={checked}
            onClick={() => onChange(!checked)}
        >
            <span className="wk-switch-knob" />
        </button>
    )
}

export interface SegmentedOption<T extends string> {
    value: T
    label: ReactNode
    title?: string
}

export function Segmented<T extends string>({
    options,
    value,
    onChange,
    ariaLabel
}: {
    options: ReadonlyArray<SegmentedOption<T>>
    value: T
    onChange: (next: T) => void
    ariaLabel?: string
}) {
    return (
        <div className="wk-seg" role="group" aria-label={ariaLabel}>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    aria-pressed={value === opt.value}
                    title={opt.title}
                    data-active={value === opt.value}
                    className="wk-seg-item"
                    onClick={() => onChange(opt.value)}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}
