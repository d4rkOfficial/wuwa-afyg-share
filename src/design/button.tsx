'use client'

// 设计系统 v2 · 按钮
// 硬规则 H2：只有 32 / 36 两档高度；"次要"靠 variant 表达，绝不靠缩小高度（H6 的反面）
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type WkButtonVariant = 'outline' | 'primary' | 'quiet' | 'danger'
export type WkButtonSize = 'md' | 'sm'

export interface WkButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** outline=默认描边 · primary=实心绛红（每屏唯一） · quiet=纯文字 · danger=破坏性 */
    variant?: WkButtonVariant
    size?: WkButtonSize
    /** 只放图标时用：正方形，宽度 = 高度 */
    iconOnly?: boolean
    leading?: ReactNode
}

export function WkButton({
    variant = 'outline',
    size = 'md',
    iconOnly = false,
    leading,
    className,
    children,
    type = 'button',
    ...rest
}: WkButtonProps) {
    return (
        <button
            type={type}
            className={cn(
                'wk-btn',
                variant !== 'outline' && `wk-btn--${variant}`,
                size === 'sm' && 'wk-btn--sm',
                iconOnly && 'wk-btn--icon',
                className
            )}
            {...rest}
        >
            {leading}
            {children}
        </button>
    )
}

/** @desc 图标按钮：必须有 label（同时作为 aria-label 与 title） */
export function WkIconButton({
    label,
    size = 'md',
    className,
    children,
    ...rest
}: Omit<WkButtonProps, 'iconOnly' | 'leading'> & { label: string }) {
    return (
        <WkButton {...rest} size={size} iconOnly aria-label={label} title={label} className={className}>
            {children}
        </WkButton>
    )
}
