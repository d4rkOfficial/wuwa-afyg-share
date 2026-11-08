'use client'

// 启动器下载卡片（新系统）
// 逻辑与旧版一致：SSR 先按「支持」渲染，挂载后按真实系统纠正，避免水合不一致。
import { useEffect, useState } from 'react'
import { WkBadge, WkCard } from '@/design'

const FILES = [
    {
        key: 'exe',
        href: '/download',
        format: '.exe',
        title: '最小化单文件可执行程序',
        note: '不想安装、双击即用的便携版，依赖齐全时优先选它。',
        badge: '推荐'
    },
    {
        key: 'msi',
        href: '/download/msi',
        format: '.msi',
        title: '安装向导（Windows Installer）',
        note: 'exe 被杀软拦截或闪退时用这个，会走标准安装 / 卸载流程。',
        badge: '安装包'
    }
] as const

function isWindows(): boolean {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    const platform = nav.userAgentData?.platform || ''
    const ua = nav.userAgent || ''
    return /windows/i.test(platform) || /windows/i.test(ua)
}

export default function LauncherDownloads() {
    const [supported, setSupported] = useState(true)

    useEffect(() => {
        // SSR 先按「支持」渲染，挂载后再纠正；这里必须同步读一次 navigator。
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSupported(isWindows())
    }, [])

    const blocked = !supported

    return (
        <section style={{ display: 'grid', gap: 12 }}>
            <div className="wk-section-head">
                <h2 style={{ fontSize: 'var(--wk-t-sec)' }}>选择下载方式</h2>
            </div>

            {blocked && (
                <p className="wk-meta" style={{ color: 'var(--wk-warn)' }}>
                    椰果工具箱启动器只提供 Windows 10 / 11（x64）版本，检测到当前系统不是 Windows，下载已停用。
                </p>
            )}

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {FILES.map((file) => {
                    const body = (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600 }}>{file.format}</span>
                                <WkBadge tone="accent">{file.badge}</WkBadge>
                                {blocked && <WkBadge tone="warn">仅 Windows</WkBadge>}
                            </div>
                            <p style={{ marginTop: 4 }}>{file.title}</p>
                            <p className="wk-meta" style={{ marginTop: 4, lineHeight: 1.65 }}>
                                {file.note}
                            </p>
                        </>
                    )

                    if (blocked) {
                        return (
                            <WkCard key={file.key} pad aria-disabled="true" style={{ opacity: 0.55, cursor: 'not-allowed' }}>
                                {body}
                            </WkCard>
                        )
                    }

                    return (
                        <a
                            key={file.key}
                            href={file.href}
                            download
                            className="wk-card wk-card-pad"
                            style={{ display: 'block', color: 'var(--wk-fg)', textDecoration: 'none' }}
                        >
                            {body}
                            <span className="wk-clear" style={{ display: 'inline-block', marginTop: 10 }}>
                                下载 {file.format}
                            </span>
                        </a>
                    )
                })}
            </div>

            <p className="wk-meta">
                {blocked
                    ? '如果你其实在 Windows 上看到这条提示，请换用 Chrome / Edge 等浏览器再试。'
                    : '两个包内容一致，只是分发形式不同。下载后如果浏览器提示「已阻止」，在下载栏选择「保留」。'}
            </p>
        </section>
    )
}
