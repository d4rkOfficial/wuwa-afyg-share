import type { Metadata } from 'next'
import LauncherDownloads from '@/components/wk/launcher-downloads'
import WkCopyButton from '@/components/wk/copy-button'
import { WkBadge, WkContainer, WkRoot } from '@/design'

export const metadata: Metadata = {
    title: '下载启动器',
    description: '下载椰果工具箱启动器：断网可用的本地工具箱，支持插件扩展。附插件开发 SDK 的上手方式。'
}

const SDK_REPO = 'https://github.com/d4rkOfficial/coconut-app-plugin-sdk'
const CLONE_CMD = `git clone ${SDK_REPO}.git`
const DEV_CMD = 'cd coconut-app-plugin-sdk && deno task dev <插件id>'

// 启动器落地页截图：先用占位图，换成实拍后只替换同名文件即可。
const SCREENSHOTS = [
    { src: '/launcher/screenshot-day.png', caption: '启动器落地页截图（日间模式）' },
    { src: '/launcher/screenshot-night.png', caption: '启动器落地页截图（夜间模式）' }
]

const STEPS = [
    {
        title: '下载并运行',
        text: '按系统选择安装包：Windows 用 .exe / .msi，macOS 用 .dmg，Linux 用 .deb / .AppImage。均以 GitHub Release 为准。'
    },
    {
        title: '启动工具箱',
        text: '启动器会拉起本地工具箱（内置静态包），断网也能用；启动器可更新本地工具箱 / 游戏数据版本。'
    },
    {
        title: '按需装插件',
        text: '想要拓展功能（拉表辅助、翻译、强化数据分析、自动化），用下面的 SDK 写自己的插件。'
    }
]

const PLUGIN_POINTS = [
    '插件是跑在启动器进程里的 QuickJS 脚本，单个 .js 放进插件目录即安装，改动 3 秒内生效。',
    '能读工具箱页面、调全部工具箱工具（配装 / 排轴 / 拉表 / 结果计算）、发 HTTP、画浮层。',
    'SDK 提供 esbuild 单文件打包、热部署、静态自查和冒烟测试，示例就是能直接运行的插件。'
]

export default function LauncherPage() {
    return (
        <WkRoot>
            <WkContainer>
                <div style={{ display: 'grid', gap: 40, maxWidth: 860 }}>
                    {/* 刊头 */}
                    <header style={{ display: 'grid', gap: 12, paddingBottom: 24, borderBottom: '1px solid var(--wk-line)' }}>
                        <h1 style={{ fontSize: 'var(--wk-t-display)' }}>椰果工具箱启动器</h1>
                        <p style={{ maxWidth: 680, lineHeight: 1.75, color: 'var(--wk-fg-2)' }}>
                            断网使用椰果工具箱、支持自定义插件。
                        </p>
                    </header>

                    {/* 启动器截图 */}
                    <section style={{ display: 'grid', gap: 12 }}>
                        <div
                            style={{
                                display: 'grid',
                                gap: 20,
                                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                                alignItems: 'start'
                            }}
                        >
                            {SCREENSHOTS.map((shot) => (
                                <figure key={shot.src} style={{ display: 'grid', gap: 10, margin: 0 }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element -- 静态截图，直接用原生 img 以避开 Workers 上的图片优化 */}
                                    <img
                                        src={shot.src}
                                        alt={shot.caption}
                                        loading="lazy"
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            height: 'auto',
                                            // 圆角已烘进 PNG，阴影跟着 alpha 走，缩放也不会露出直角
                                            filter: 'drop-shadow(0 6px 18px rgba(0, 0, 0, 0.28))'
                                        }}
                                    />
                                    <figcaption className="wk-meta" style={{ textAlign: 'center' }}>
                                        {shot.caption}
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                    </section>

                    <LauncherDownloads />

                    {/* 三步 */}
                    <section style={{ display: 'grid', gap: 12 }}>
                        <div className="wk-section-head">
                            <h2 style={{ fontSize: 'var(--wk-t-sec)' }}>三步用起来</h2>
                        </div>
                        <ol
                            style={{
                                display: 'grid',
                                gap: 12,
                                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                                margin: 0,
                                padding: 0,
                                listStyle: 'none'
                            }}
                        >
                            {STEPS.map((step, index) => (
                                <li key={step.title} className="wk-card wk-card-pad">
                                    <WkBadge tone="accent">{index + 1}</WkBadge>
                                    <p style={{ marginTop: 8, fontWeight: 600 }}>{step.title}</p>
                                    <p className="wk-meta" style={{ marginTop: 4, lineHeight: 1.7 }}>
                                        {step.text}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    </section>

                    {/* 插件 */}
                    <section style={{ display: 'grid', gap: 12 }}>
                        <div className="wk-section-head">
                            <h2 style={{ fontSize: 'var(--wk-t-sec)' }}>进阶：自己写插件</h2>
                            <a href={SDK_REPO} target="_blank" rel="noreferrer" className="wk-clear">
                                插件 SDK 仓库
                            </a>
                        </div>

                        <div className="wk-card wk-card-pad" style={{ display: 'grid', gap: 14 }}>
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, color: 'var(--wk-fg-2)' }}>
                                {PLUGIN_POINTS.map((point) => (
                                    <li key={point} style={{ lineHeight: 1.7 }}>
                                        {point}
                                    </li>
                                ))}
                            </ul>

                            <div style={{ display: 'grid', gap: 6 }}>
                                <span className="wk-label">1 · 克隆 SDK</span>
                                <div className="wk-toolbar">
                                    <code className="wk-pre wk-spacer">{CLONE_CMD}</code>
                                    <WkCopyButton text={CLONE_CMD} label="复制命令" size="sm" variant="outline" />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gap: 6 }}>
                                <span className="wk-label">2 · 起一个示例插件</span>
                                <div className="wk-toolbar">
                                    <code className="wk-pre wk-spacer">{DEV_CMD}</code>
                                    <WkCopyButton text={DEV_CMD} label="复制命令" size="sm" variant="outline" />
                                </div>
                                <p className="wk-meta">
                                    需要{' '}
                                    <a href="https://deno.com/" target="_blank" rel="noreferrer">
                                        Deno 2
                                    </a>
                                    ；仓库里已经把打包、热部署、静态自查和冒烟测试都配好了，改完保存即可在启动器里看到效果。
                                </p>
                            </div>

                            <div className="wk-toolbar">
                                <a href={SDK_REPO} target="_blank" rel="noreferrer" className="wk-btn wk-btn--sm">
                                    打开 SDK 仓库
                                </a>
                                <a
                                    href={`${SDK_REPO}/blob/main/AGENTS.md`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="wk-btn wk-btn--sm wk-btn--quiet"
                                >
                                    插件开发规则（AGENTS.md）
                                </a>
                                <a
                                    href={`${SDK_REPO}/blob/main/plugin-api/coconut-plugin.d.ts`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="wk-btn wk-btn--sm wk-btn--quiet"
                                >
                                    插件 API 类型（coconut-plugin.d.ts）
                                </a>
                            </div>
                        </div>
                    </section>

                    {/* 须知 */}
                    <section className="wk-card wk-card-pad">
                        <p style={{ fontWeight: 600 }}>安装前须知</p>
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }} className="wk-meta">
                            <li>启动器与工具箱都在本机运行，绝不泄露用户隐私。</li>
                            <li>安装包全部来自 coconut-app 的 GitHub Actions 自动构建 Release，本站只做引导。</li>
                            <li>未签名程序首次运行会被系统拦截（SmartScreen / Gatekeeper），属正常现象；只从官方 Release 下载。</li>
                        </ul>
                    </section>
                </div>
            </WkContainer>
        </WkRoot>
    )
}
