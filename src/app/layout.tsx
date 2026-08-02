import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Header from '@/components/header'
import { Toaster } from '@/components/ui/toast'
import PageLoadingOverlay from '@/components/ui/page-loading-overlay'

const geistSans = Geist({
    variable: '--font-geist-sans',
    subsets: ['latin']
})

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
        <html lang="zh-CN" className={`${geistSans.variable} min-h-full antialiased`}>
            <body className="flex min-h-dvh flex-col bg-(--bg) text-(--fg)">
                <Header />
                <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
                <footer className="border-t border-(--card-border) py-6 text-center text-xs text-(--muted)">
                    椰果工坊 · 配合 椰果工具箱 使用
                </footer>
                <Toaster />
                <PageLoadingOverlay />
            </body>
        </html>
    )
}
