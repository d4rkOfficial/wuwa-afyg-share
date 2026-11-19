'use client'

// 启动器下载卡片：安装包统一从 coconut-app 的 GitHub Release 拉取（三平台）。
// SSR 先按「支持」渲染，挂载后按真实系统纠正，避免水合不一致。
import { useEffect, useState } from 'react'
import { Icon } from '@iconify/react'
import { WkBadge } from '@/design'

const RELEASE_LATEST = 'https://github.com/d4rkOfficial/coconut-app/releases/latest'

/** 卡片右侧的平台水印图标（放大 + 混合模式，见 wk.css 的 .wk-dl-art） */
const PLATFORM_ICONS: Record<string, string> = {
    windows: 'mdi:microsoft-windows',
    macos: 'mdi:apple',
    linux: 'mdi:linux'
}

/** 发布资产用固定 ASCII 名，由 coconut-app 的 release-app.yml 上传。 */
const FILES = [
    {
        key: 'win-exe',
        platforms: ['windows'],
        href: `${RELEASE_LATEST}/download/coconut-app-windows-x64.exe`,
        format: '.exe',
        title: 'Windows 便携版（单文件）',
        note: '双击即用，不需要安装；SmartScreen 拦截时点「更多信息 → 仍要运行」。',
        badge: '推荐'
    },
    {
        key: 'win-msi',
        platforms: ['windows'],
        href: `${RELEASE_LATEST}/download/coconut-app-windows-x64.msi`,
        format: '.msi',
        title: 'Windows 安装向导',
        note: 'exe 被杀软拦下时用这个，走标准安装 / 卸载流程。',
        badge: '安装包'
    },
    {
        key: 'mac-arm',
        platforms: ['macos'],
        href: `${RELEASE_LATEST}/download/coconut-app-macos-aarch64.dmg`,
        format: '.dmg',
        title: 'macOS Apple Silicon (M 系列)',
        note: '未签名的 dmg：下载后右键「打开」，或在「系统设置 → 隐私与安全性」里允许。',
        badge: 'Apple Silicon'
    },
    {
        key: 'mac-x64',
        platforms: ['macos'],
        href: `${RELEASE_LATEST}/download/coconut-app-macos-x64.dmg`,
        format: '.dmg',
        title: 'macOS Intel',
        note: '未签名的 dmg：下载后右键「打开」，或在「系统设置 → 隐私与安全性」里允许。',
        badge: 'Intel'
    },
    {
        key: 'linux-deb',
        platforms: ['linux'],
        href: `${RELEASE_LATEST}/download/coconut-app-linux-x64.deb`,
        format: '.deb',
        title: 'Linux DEB 安装包',
        note: '适用于 Debian / Ubuntu 系：sudo apt install ./coconut-app-linux-x64.deb。',
        badge: 'DEB'
    },
    {
        key: 'linux-appimage',
        platforms: ['linux'],
        href: `${RELEASE_LATEST}/download/coconut-app-linux-x64.AppImage`,
        format: '.AppImage',
        title: 'Linux AppImage（便携版）',
        note: '下载后 chmod +x 即可运行；部分发行版需要安装 libfuse2。',
        badge: 'AppImage'
    }
] as const

type Platform = 'windows' | 'macos' | 'linux' | 'other'

function detectPlatform(): Platform {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = `${nav.userAgentData?.platform || ''} ${nav.userAgent || ''}`
    if (/windows/i.test(platform)) return 'windows'
    if (/macintosh|mac os x|macintel/i.test(platform)) return 'macos'
    if (/linux/i.test(platform) && !/android/i.test(platform)) return 'linux'
    return 'other'
}

export default function LauncherDownloads() {
    // SSR 先按 Windows 渲染，挂载后高亮真实系统（其它平台仍可下载）
    const [platform, setPlatform] = useState<Platform>('windows')

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPlatform(detectPlatform())
    }, [])

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <div className="wk-section-head">
                <h2 style={{ fontSize: 'var(--wk-t-sec)' }}>选择下载方式</h2>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {FILES.map((file) => {
                    const recommended = (file.platforms as readonly string[]).includes(platform)
                    const body = (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600 }}>{file.format}</span>
                                <WkBadge tone="accent">{file.badge}</WkBadge>
                                {recommended && <WkBadge tone="accent">当前系统</WkBadge>}
                            </div>
                            <p style={{ marginTop: 4 }}>{file.title}</p>
                            <p className="wk-meta" style={{ marginTop: 4, lineHeight: 1.65 }}>
                                {file.note}
                            </p>
                        </>
                    )

                    return (
                        <a
                            key={file.key}
                            href={file.href}
                            className="wk-card wk-card-pad wk-dl-card"
                            style={{
                                display: 'block',
                                color: 'var(--wk-fg)',
                                textDecoration: 'none'
                            }}
                        >
                            {/* 右侧放大平台图标：纸 = 正片叠底，墨夜 = 滤色（见 .wk-dl-art） */}
                            <span className="wk-dl-art" aria-hidden="true">
                                <Icon icon={PLATFORM_ICONS[file.platforms[0]]} />
                            </span>
                            <span className="wk-dl-card-body">
                                {body}
                                <span className="wk-clear" style={{ display: 'inline-block', marginTop: 10 }}>
                                    从 GitHub Release 下载
                                </span>
                            </span>
                        </a>
                    )
                })}
            </div>

            <p className="wk-meta">
                所有安装包由 coconut-app 的 GitHub Actions 自动构建，版本与更新日志见{' '}
                <a href={RELEASE_LATEST} target="_blank" rel="noreferrer" className="wk-clear">
                    Releases 页面
                </a>
                。macOS 应用未签名，首次打开需要右键或系统设置里放行。
            </p>
        </section>
    )
}
