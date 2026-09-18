import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import './globals.css'
import Header from '@/components/header'
import { Toaster } from '@/components/ui/toast'

const sans = Space_Grotesk({
    variable: '--font-geist-sans',
    subsets: ['latin'],
    weight: ['400', '500', '600', '700']
})

// 首帧主题初始化：工具箱通过 iframe 打开工坊时用 #theme=light|dark 透传当前白天/黑夜偏好，
// 该值优先于本地保存并写回 localStorage（后续站内跳转沿用）；无 hash 时按本地保存 / 系统偏好决定。
// 注意：theme-toggle 挂载时也会 sync 一次，那里同样优先读 hash（见 theme-toggle.tsx），避免被系统偏好覆盖。
const themeInitScript = `
(() => {
    let saved = null;
    try { saved = localStorage.getItem('share-theme'); } catch {}
    let fromHash = null;
    try {
        const matched = /(?:^|&)theme=(light|dark)(?:&|$)/.exec(window.location.hash.replace(/^#/, ''));
        if (matched) fromHash = matched[1];
    } catch {}
    if (fromHash) {
        saved = fromHash;
        try { localStorage.setItem('share-theme', fromHash); } catch {}
    }
    const light = saved === 'light' || (saved !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.classList.toggle('light', light);
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
})();`

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
        <html lang="zh-CN" suppressHydrationWarning className={`${sans.variable} min-h-full antialiased`}>
            <head>
                <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            </head>
            <body className="flex min-h-dvh flex-col bg-(--bg) text-(--fg)">
                <Header />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8 md:py-12">{children}</main>
                <footer className="border-t-2 border-(--card-border) py-8 text-center text-xs text-(--muted)">
                    椰果工坊 · 配合 椰果工具箱 使用
                </footer>
                <Toaster />
            </body>
        </html>
    )
}
