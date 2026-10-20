'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@iconify/react'

/**
 * @desc 启动器下载入口：点击弹出「.exe / .msi 二选一」下载弹窗。
 *   触发器外观由调用方通过 className / children 决定（首页刊头大按钮、页脚小链接共用）。
 */
export default function LauncherDownloadTrigger({
    children,
    className,
    title,
    ariaLabel
}: {
    children: ReactNode
    className?: string
    title?: string
    ariaLabel?: string
}) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={className}
                title={title}
                aria-label={ariaLabel}
                aria-haspopup="dialog"
            >
                {children}
            </button>
            {open ? <DownloadDialog onClose={() => setOpen(false)} /> : null}
        </>
    )
}

const OPTIONS = [
    {
        key: 'exe',
        href: '/download',
        icon: 'mdi:application-outline',
        format: '.exe',
        name: '最小化单文件可执行程序',
        note: '确保依赖全齐时下载这个',
        badge: '单文件'
    },
    {
        key: 'msi',
        href: '/download/msi',
        icon: 'mdi:package-variant-closed',
        format: '.msi',
        name: '安装引导程序',
        note: 'exe 如果闪退则安装这个',
        badge: '安装包'
    }
] as const

function DownloadDialog({ onClose }: { onClose: () => void }) {
    const closeRef = useRef<HTMLButtonElement>(null)

    useEffect(() => {
        closeRef.current?.focus()
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', onKey)
        const prevOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = prevOverflow
        }
    }, [onClose])

    return createPortal(
        <div className="fixed inset-0 z-[80]">
            <div className="fixed inset-0 bg-(--overlay)" aria-hidden="true" />
            <div
                className="fixed inset-0 flex items-center justify-center p-4"
                onClick={(event) => {
                    // 点遮罩关闭；点弹窗内部不关闭（拖选文本也不会误触发）
                    if (event.target === event.currentTarget) onClose()
                }}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="launcher-download-title"
                    className="mg-card relative flex max-h-[88dvh] w-[min(96vw,520px)] flex-col overflow-hidden"
                >
                    <div className="flex items-start justify-between gap-3 border-b px-4 py-3 mg-hairline">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-(--card-hover) text-(--accent-text)">
                                <Icon icon="mdi:download-box-outline" className="size-4" />
                            </span>
                            <div className="min-w-0">
                                <h2 id="launcher-download-title" className="mg-title text-base">
                                    下载椰果工具箱启动器
                                </h2>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-(--muted)">
                                    断网可用 · 随时拉表 · 白嫖免费AI模型
                                </p>
                            </div>
                        </div>
                        <button
                            ref={closeRef}
                            type="button"
                            onClick={onClose}
                            aria-label="关闭下载弹窗"
                            className="rounded-sm p-1 text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg)"
                        >
                            <Icon icon="mdi:close" className="size-5" />
                        </button>
                    </div>

                    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
                        <p className="text-xs leading-relaxed text-(--muted)">
                            二选一即可，两个包内容相同，只是分发形式不同：
                        </p>

                        {OPTIONS.map((option) => (
                            <a
                                key={option.key}
                                href={option.href}
                                download
                                className="group flex items-start gap-3 rounded-sm border border-(--card-border) bg-(--card) p-3 transition-colors hover:border-(--accent) hover:bg-(--card-hover)"
                            >
                                <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-(--card-border) bg-(--card-hover) text-(--accent-text)">
                                    <Icon icon={option.icon} className="size-5" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="mg-title text-sm">{option.format}</span>
                                        <span className="rounded-sm border border-(--card-border) px-1.5 py-0.5 text-[10px] leading-none text-(--muted)">
                                            {option.badge}
                                        </span>
                                    </span>
                                    <span className="mt-1 block text-sm leading-snug text-(--fg)">
                                        {option.name}
                                    </span>
                                    <span className="mt-0.5 block text-xs leading-relaxed text-(--muted)">
                                        {option.note}
                                    </span>
                                </span>
                                <Icon
                                    icon="mdi:download"
                                    className="mt-1.5 size-5 shrink-0 text-(--muted) transition-colors group-hover:text-(--accent-text)"
                                />
                            </a>
                        ))}

                        <p className="pt-1 text-[11px] leading-relaxed text-(--muted)">
                            点击即开始下载；下载后如被浏览器拦截，请在下载栏选择「保留」。
                        </p>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
