'use client'

// 全站统一的加载态：**大号旋转图标**（不再用骨架屏）。
// 放在路由级 loading.tsx 里时铺满主内容区；放在组件内（如实体目录拉取）时居中占位。
import { Icon } from '@iconify/react'

interface Props {
    label?: string
    /** @desc 铺满高度的容器类（路由级 loading 用 `py-24` 之类，组件内用默认） */
    className?: string
    /** @desc 图标尺寸类 */
    size?: string
}

export default function LoadingIndicator({ label = '加载中…', className = 'py-20', size = 'size-9' }: Props) {
    return (
        <div
            role="status"
            aria-live="polite"
            className={`flex w-full flex-col items-center justify-center gap-3 text-(--muted) ${className}`}
        >
            <Icon icon="mdi:loading" className={`${size} animate-spin text-(--accent-text)`} />
            {label && <span className="text-xs tracking-[0.18em]">{label}</span>}
        </div>
    )
}
