'use client'

// 设计系统原语（保留 API，输出 .wk-* 类）
// 这些组件原先输出 .ui-* 类；Batch 5 起统一改到新系统，Buff 编辑器内部随之继承新外观。
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    size?: 'md' | 'sm'
    /** @desc 只显示图标时使用（方形、无内距） */
    iconOnly?: boolean
    leading?: ReactNode
}

/** @desc variant 映射到 wk 变体：accent 与 primary 在新系统里是同一个填充语义 */
function variantClass(variant: Variant): string {
    if (variant === 'primary' || variant === 'accent') return 'wk-btn--primary'
    if (variant === 'ghost') return 'wk-btn--ghost'
    if (variant === 'danger') return 'wk-btn--danger'
    return ''
}

export function Button({
    variant = 'default',
    size = 'md',
    iconOnly = false,
    leading,
    className = '',
    children,
    type = 'button',
    ...rest
}: ButtonProps) {
    const cls = ['wk-btn', variantClass(variant), size === 'sm' ? 'wk-btn--sm' : '', iconOnly ? 'wk-btn--icon' : '', className]
        .filter(Boolean)
        .join(' ')
    return (
        <button type={type} className={cls} {...rest}>
            {leading}
            {children}
        </button>
    )
}

export function IconButton({
    label,
    className = '',
    size = 'md',
    children,
    ...rest
}: Omit<ButtonProps, 'iconOnly' | 'leading'> & { label: string }) {
    return (
        <Button {...rest} size={size} iconOnly aria-label={label} title={label} className={className}>
            {children}
        </Button>
    )
}
