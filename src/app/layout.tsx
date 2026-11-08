import type { Metadata } from 'next'
import './globals.css'
import WkTopbar from '@/components/wk/topbar'
import { WkToaster } from '@/design'
import { themeInitScript } from '@/lib/theme'

// 首帧主题初始化：工具箱通过 iframe 打开工坊时用 #theme=light|dark 透传当前白天/黑夜偏好，
// 该值优先于本地保存并写回 localStorage。逻辑现在只有一份，见 src/lib/theme.ts。
export const metadata: Metadata = {
    title: {
        default: '椰果工坊',
        template: '%s · 椰果工坊'
    },
    description: '分享、浏览和克隆《鸣潮》拉表排轴工程的社区平台，配合椰果工具箱使用。'
}

export default function RootLayout({
    children
}: Readonly<{
    children: React.ReactNode
}>) {
    return (
        <html lang="zh-CN" suppressHydrationWarning className="min-h-full antialiased">
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            </head>
            <body className="flex min-h-dvh flex-col">
                <WkTopbar />
                <main className="flex-1">{children}</main>
                {/* 页脚只留一行文字：编辑锁已搬到顶栏（原先在这里，被 fixed 外壳盖住） */}
                <footer className="wk wk-footer">
                    <div className="wk-footer-in">椰果工坊 · 与 椰果工具箱 搭配使用</div>
                </footer>
                <WkToaster />
            </body>
        </html>
    )
}
