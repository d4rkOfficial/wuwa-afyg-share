import type { Metadata } from 'next'
import Link from 'next/link'
import { Icon } from '@iconify/react'
import CopyButton from '@/components/copy-button'
import LauncherDownloads from '@/components/launcher-downloads'

export const metadata: Metadata = {
    title: '下载启动器',
    description:
        '下载椰果工具箱启动器：断网可用的本地工具箱，支持插件扩展。附插件开发 SDK 的上手方式。'
}

const LAUNCHER_VERSION = 'v0.1.0'
const SDK_REPO = 'https://github.com/d4rkOfficial/coconut-app-plugin-sdk'
const CLONE_CMD = `git clone ${SDK_REPO}.git`

const FEATURES = [
    { icon: 'mdi:wifi-off', text: '断网可用' },
    { icon: 'mdi:table-large', text: '随时拉表排轴' },
    { icon: 'mdi:puzzle-outline', text: '支持插件扩展' }
]

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
        <div className="space-y-10 md:space-y-12">
            <div className="border-b mg-hairline pb-6">
                <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                >
                    <Icon icon="mdi:arrow-left" className="size-3.5" />
                    返回工坊首页
                </Link>

                <div className="mt-4 flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
                    <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[11px] tracking-[0.18em] text-(--muted) uppercase">
                            <span>Launcher</span>
                            <span className="rounded-sm border border-(--card-border) px-1.5 py-0.5 tracking-normal normal-case">
                                {LAUNCHER_VERSION}
                            </span>
                            <span className="rounded-sm border border-(--card-border) px-1.5 py-0.5 tracking-normal normal-case">
                                Windows 10 / 11
                            </span>
                        </p>
                        <h1 className="mg-title-xl mt-2 text-3xl md:text-4xl">椰果工具箱启动器</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-(--muted)">
                            把《鸣潮》的拉表排轴工具箱装到本机：本地运行、断网可用、支持插件扩展。
                            下载后双击即可启动，不需要额外安装 Node、Python 之类的环境。
                        </p>
                        <ul className="mt-4 flex flex-wrap gap-2">
                            {FEATURES.map((feature) => (
                                <li
                                    key={feature.text}
                                    className="inline-flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--card) px-2 py-1 text-[11px] leading-none text-(--muted)"
                                >
                                    <Icon icon={feature.icon} className="size-3.5 text-(--accent-text)" />
                                    {feature.text}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>

            <LauncherDownloads />

            <section className="space-y-3">
                <div className="mg-section">
                    <Icon icon="mdi:numeric-1-circle-outline" className="size-4 text-(--accent-text)" />
                    <h2 className="mg-title text-base">三步用起来</h2>
                </div>
                <ol className="grid gap-3 md:grid-cols-3">
                    {STEPS.map((step, index) => (
                        <li key={step.title} className="mg-card p-4">
                            <span className="inline-flex size-6 items-center justify-center rounded-full border border-(--card-border) bg-(--card-hover) font-mono text-[11px] text-(--accent-text)">
                                {index + 1}
                            </span>
                            <p className="mg-title mt-2.5 text-sm">{step.title}</p>
                            <p className="mg-note mt-1.5">{step.text}</p>
                        </li>
                    ))}
                </ol>
            </section>

            <section className="space-y-3">
                <div className="mg-section">
                    <Icon icon="mdi:puzzle-outline" className="size-4 text-(--accent-text)" />
                    <h2 className="mg-title text-base">进阶：自己写插件</h2>
                    <a
                        href={SDK_REPO}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                    >
                        <Icon icon="mdi:github" className="size-3.5" />
                        插件 SDK 仓库
                        <Icon icon="mdi:open-in-new" className="size-3" />
                    </a>
                </div>

                <div className="mg-card p-4">
                    <ul className="space-y-2">
                        {PLUGIN_POINTS.map((point) => (
                            <li key={point} className="flex gap-2 text-[13px] leading-relaxed text-(--muted)">
                                <Icon
                                    icon="mdi:check-circle-outline"
                                    className="mt-0.5 size-4 shrink-0 text-(--success-text)"
                                />
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>

                    <p className="mt-4 text-[11px] font-black tracking-[0.14em] text-(--muted) uppercase">
                        1 · 克隆 SDK
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 overflow-x-auto rounded-sm border border-(--card-border) bg-(--code-bg) px-3 py-2 font-mono text-[12px] whitespace-nowrap text-(--fg)">
                            {CLONE_CMD}
                        </code>
                        <CopyButton text={CLONE_CMD} label="复制命令" />
                    </div>

                    <p className="mt-4 text-[11px] font-black tracking-[0.14em] text-(--muted) uppercase">
                        2 · 起一个示例插件
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 overflow-x-auto rounded-sm border border-(--card-border) bg-(--code-bg) px-3 py-2 font-mono text-[12px] whitespace-nowrap text-(--fg)">
                            cd coconut-app-plugin-sdk && deno task dev &lt;插件id&gt;
                        </code>
                        <CopyButton
                            text="cd coconut-app-plugin-sdk && deno task dev <插件id>"
                            label="复制命令"
                        />
                    </div>
                    <p className="mg-note mt-2">
                        需要{' '}
                        <a
                            href="https://deno.com/"
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-(--card-border) underline-offset-2 hover:text-(--fg)"
                        >
                            Deno 2
                        </a>{' '}
                        ；仓库里已经把打包、热部署、静态自查和冒烟测试都配好了，改完保存即可在启动器里看到效果。
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <a
                            href={SDK_REPO}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--btn-bg) px-3 py-2 text-sm font-black tracking-tight text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg)"
                        >
                            <Icon icon="mdi:github" className="size-4" />
                            打开 SDK 仓库
                        </a>
                        <a
                            href={`${SDK_REPO}/blob/main/AGENTS.md`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--card) px-3 py-2 text-sm text-(--muted) transition-colors hover:border-(--accent) hover:bg-(--card-hover) hover:text-(--fg)"
                        >
                            <Icon icon="mdi:book-open-variant" className="size-4" />
                            插件开发规则（AGENTS.md）
                        </a>
                        <a
                            href={`${SDK_REPO}/blob/main/plugin-api/coconut-plugin.d.ts`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--card) px-3 py-2 text-sm text-(--muted) transition-colors hover:border-(--accent) hover:bg-(--card-hover) hover:text-(--fg)"
                        >
                            <Icon icon="mdi:language-typescript" className="size-4" />
                            插件 API 类型（coconut-plugin.d.ts）
                        </a>
                    </div>
                </div>
            </section>

            <section className="mg-card p-4">
                <div className="flex items-start gap-2.5">
                    <Icon icon="mdi:shield-alert-outline" className="mt-0.5 size-4 shrink-0 text-(--warning-text)" />
                    <div className="min-w-0">
                        <p className="mg-title text-sm">安装前须知</p>
                        <ul className="mg-note mt-1.5 space-y-1">
                            <li>· 启动器与工具箱都在本机运行，绝不泄露用户隐私。</li>
                            <li>· 首次运行可能被 Windows SmartScreen 提示，这是未签名程序的正常行为。</li>
                            <li>· 只从本站或项目仓库下载，别用来路不明的「整合包」。</li>
                        </ul>
                    </div>
                </div>
            </section>
        </div>
    )
}
