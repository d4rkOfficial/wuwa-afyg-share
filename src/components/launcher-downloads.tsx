'use client'

import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'

/** 两个下载包：内容一致，只是分发形式不同。 */
const FILES = [
    {
        key: 'exe',
        href: '/download',
        format: '.exe',
        title: '最小化单文件可执行程序',
        note: '不想安装、双击即用的便携版，依赖齐全时优先选它。',
        badge: '推荐',
        icon: 'mdi:application-outline'
    },
    {
        key: 'msi',
        href: '/download/msi',
        format: '.msi',
        title: '安装向导（Windows Installer）',
        note: 'exe 被杀软拦截或闪退时用这个，会走标准安装 / 卸载流程。',
        badge: '安装包',
        icon: 'mdi:package-variant-closed'
    }
] as const

/** 启动器只提供 Windows 10 / 11 (x64) 版本。 */
function isWindows(): boolean {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = nav.userAgentData?.platform || ''
    const ua = nav.userAgent || ''
    return /windows/i.test(platform) || /windows/i.test(ua)
}

export default function LauncherDownloads() {
    // 先按「支持」渲染（SSR 一致），挂载后再按真实系统纠正，避免水合不一致
    const [supported, setSupported] = useState(true)

    useEffect(() => {
        setSupported(isWindows())
    }, [])

    const blocked = !supported

    return (
        <section className="space-y-3">
            <div className="mg-section">
                <Icon icon="mdi:download-box-outline" className="size-4 text-(--accent-text)" />
                <h2 className="mg-title text-base">选择下载方式</h2>
            </div>

            {blocked ? (
                <div className="flex items-start gap-2.5 rounded-sm border border-(--warning) bg-(--card) p-3">
                    <Icon
                        icon="mdi:monitor-off"
                        className="mt-0.5 size-4 shrink-0 text-(--warning-text)"
                    />
                    <div className="min-w-0">
                        <p className="mg-title text-sm">当前系统无法运行工具箱</p>
                        <p className="mg-note mt-1">
                            椰果工具箱启动器只提供 Windows 10 / 11（x64）版本，检测到当前系统不是
                            Windows，下载按钮已停用。
                        </p>
                    </div>
                </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
                {FILES.map((file) => {
                    const body = (
                        <>
                            <span className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-(--card-border) bg-(--card-hover) text-(--accent-text)">
                                <Icon icon={file.icon} className="size-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                    <span className="mg-title text-sm">{file.format}</span>
                                    <span className="rounded-sm border border-(--card-border) px-1.5 py-0.5 text-[10px] leading-none text-(--muted)">
                                        {file.badge}
                                    </span>
                                    {blocked ? (
                                        <span className="rounded-sm border border-(--warning) px-1.5 py-0.5 text-[10px] leading-none text-(--warning-text)">
                                            仅 Windows
                                        </span>
                                    ) : null}
                                </span>
                                <span className="mt-1 block text-sm leading-snug text-(--fg)">
                                    {file.title}
                                </span>
                                <span className="mg-note mt-1 block">{file.note}</span>
                            </span>
                            <Icon
                                icon={blocked ? 'mdi:cancel' : 'mdi:download'}
                                className="mt-2 size-5 shrink-0 text-(--muted)"
                            />
                        </>
                    )

                    if (blocked) {
                        return (
                            <div
                                key={file.key}
                                aria-disabled="true"
                                className="mg-card flex cursor-not-allowed items-start gap-3 p-4 opacity-55 select-none"
                            >
                                {body}
                            </div>
                        )
                    }

                    return (
                        <a
                            key={file.key}
                            href={file.href}
                            download
                            className="mg-card group flex items-start gap-3 p-4 hover:border-(--accent) hover:bg-(--card-hover)"
                        >
                            {body}
                        </a>
                    )
                })}
            </div>

            <p className="mg-note">
                {blocked
                    ? '如果你其实在 Windows 上看到这条提示，请换用 Chrome / Edge 等浏览器再试。'
                    : '两个包内容一致，只是分发形式不同。下载后如果浏览器提示「已阻止」，在下载栏选择「保留」。'}
            </p>
        </section>
    )
}
