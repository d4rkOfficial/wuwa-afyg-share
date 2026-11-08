// 设计系统 v2 · 外壳
// WkRoot 提供 .wk 作用域（所有 token 与 class 都在这个作用域下生效）。
// Toast 容器只在根布局挂一次（见 app/layout.tsx），避免多份重复。
// 用法：新页面最外层包 <WkRoot><WkContainer>…</WkContainer></WkRoot>
import type { ReactNode } from 'react'
import { cn } from './cn'

export function WkRoot({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('wk', 'wk-page', className)}>{children}</div>
}

export function WkContainer({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('wk-container', className)}>{children}</div>
}
