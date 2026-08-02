'use client'

import Link from 'next/link'
import { showPageLoading } from '@/components/ui/page-loading-overlay'

type LinkProps = React.ComponentProps<typeof Link>

export default function AppLink({ onClick, children, ...props }: LinkProps) {
    return (
        <Link
            {...props}
            onClick={(e) => {
                onClick?.(e)
                // 外部链接 / 新标签 / 锚点不触发全屏遮罩
                const href = typeof props.href === 'string' ? props.href : ''
                if (props.target === '_blank' || href.startsWith('#')) return
                showPageLoading()
            }}
        >
            {children}
        </Link>
    )
}
