import type { Metadata } from 'next'
import Link from 'next/link'
import LauncherDownloads from '@/components/wk/launcher-downloads'
import WkCopyButton from '@/components/wk/copy-button'
import { WkBadge, WkContainer, WkRoot } from '@/design'

export const metadata: Metadata = {
    title: '下载启动器',
    description: '下载椰果工具箱启动器：断网可用的本地工具箱，支持插件扩展。附插件开发 SDK 的上手方式。'
}

const LAUNCHER_VERSION = 'v0.3.0'
const SDK_REPO = 'https://github.com/d4rkOfficial/coconut-app-plugin-sdk'
const CLONE_CMD = `git clone ${SDK_REPO}.git`
const DEV_CMD = 'cd coconut-app-plugin-sdk && deno task dev <插件id>'

const FEATURES = ['断网可用', '随时拉表排轴', '支持插件扩展']

const STEPS = [
    {
        title: '下载并运行',
        text: '优先用 .exe 便携版；被 SmartScreen 拦下时点「更多信息 → 仍要运行」，或改用 .msi。'
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
                        <Link href="/" className="wk-clear">
                            返回工坊首页
                        </Link>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                            <WkBadge>{LAUNCHER_VERSION}</WkBadge>
                            <WkBadge>Windows 10 / 11</WkBadge>
                        </div>
                        <h1 style={{ fontSize: 'var(--wk-t-display)' }}>椰果工具箱启动器</h1>
                        <p style={{ maxWidth: 680, lineHeight: 1.75, color: 'var(--wk-fg-2)' }}>
                            把《鸣潮》的拉表排轴工具箱装到本机：本地运行、断网可用、支持插件扩展。
                            下载后双击即可启动，不需要额外安装 Node、Python 之类的环境。
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {FEATURES.map((feature) => (
                                <WkBadge key={feature}>{feature}</WkBadge>
                            ))}
                        </div>
                    </header>

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
                            <li>首次运行可能被 Windows SmartScreen 提示，这是未签名程序的正常行为。</li>
                            <li>只从本站或项目仓库下载，别用来路不明的「整合包」。</li>
                        </ul>
                    </section>
                </div>
            </WkContainer>
        </WkRoot>
    )
}
