'use client'

// 设计系统 v2 · 表单
// 硬规则 H2：控件与按钮同高（36）；标签在上、控件在下，标签 12px（H1）
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'
import { cn } from './cn'

export function WkField({
    label,
    hint,
    aside,
    htmlFor,
    children,
    className
}: {
    label?: ReactNode
    hint?: ReactNode
    /** label 右侧附加内容（计数、重置等） */
    aside?: ReactNode
    htmlFor?: string
    children: ReactNode
    className?: string
}) {
    return (
        <div className={cn('wk-field', className)}>
            {(label || aside) && (
                <span className="wk-field-label" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                    <label htmlFor={htmlFor}>{label}</label>
                    {aside}
                </span>
            )}
            {children}
            {hint && <span className="wk-field-hint">{hint}</span>}
        </div>
    )
}

export function WkInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={cn('wk-input', className)} {...rest} />
}

export function WkTextarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={cn('wk-textarea', className)} {...rest} />
}

export function WkSelect({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select className={cn('wk-select', className)} {...rest}>
            {children}
        </select>
    )
}

/** @desc 开关：role=switch + aria-checked，键盘可切换 */
export function WkSwitch({
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

export interface WkSegmentedOption<T extends string> {
    value: T
    label: ReactNode
    title?: string
}

/** @desc 分段控件：用 aria-pressed 而不是 tab 语义（它不是导航，是筛选） */
export function WkSegmented<T extends string>({
    options,
    value,
    onChange,
    ariaLabel
}: {
    options: ReadonlyArray<WkSegmentedOption<T>>
    value: T
    onChange: (next: T) => void
    ariaLabel?: string
}) {
    return (
        <div className="wk-seg" role="group" aria-label={ariaLabel}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    title={option.title}
                    data-active={value === option.value}
                    className="wk-seg-item"
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    )
}

/** @desc 给"输入 + 下方提示"生成稳定 id，避免同一页多个 Field 抢同一 label */
export function useFieldId(prefix = 'wk-field'): string {
    return `${prefix}-${useId()}`
}
