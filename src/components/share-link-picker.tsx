'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { toast } from '@/components/ui/toast'
import { copyText } from '@/lib/utils/clipboard'

// 工具箱实例快捷按钮
const INSTANCES = [
    { name: '主站', url: 'https://wuwa-afyg-tool.200503.xyz' },
    { name: '副站', url: 'https://wuwa-hpyg-tool.200503.xyz' },
    { name: '本地', url: 'http://localhost:5173' }
]

interface Props {
    code: string
    label?: string
}

export default function ShareLinkPicker({ code, label = '复制链接' }: Props) {
    const [open, setOpen] = useState(false)
    const [toolUrl, setToolUrl] = useState(INSTANCES[0].url)
    const titleId = useId()
    const descriptionId = useId()
    const inputId = useId()
    const dialogRef = useRef<HTMLDivElement>(null)
    const shareBase = typeof window !== 'undefined' ? window.location.origin : ''
    const downloadUrl = `${shareBase}/share/${code}/download`
    const link = `${toolUrl.replace(/\/+$/, '')}/#import_project=${encodeURIComponent(downloadUrl)}`

    useEffect(() => {
        if (!open) return

        const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus({ preventScroll: true }))

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKeyDown)

        return () => {
            cancelAnimationFrame(focusFrame)
            document.body.style.overflow = previousOverflow
            window.removeEventListener('keydown', onKeyDown)
            if (previousActiveElement?.isConnected) previousActiveElement.focus({ preventScroll: true })
        }
    }, [open])

    async function copy() {
        if (!toolUrl.trim()) {
            toast('请先输入工具箱链接', 'error')
            return
        }

        if (await copyText(link)) {
            toast('已复制，可在工具箱中直接打开', 'success')
            setOpen(false)
        } else {
            toast('复制失败，请长按下方链接手动复制', 'error')
        }
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1 rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <Icon icon="mdi:link-variant" className="size-4" />
                {label}
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
                    <div
                        className="absolute inset-0 bg-black/60 "
                        onClick={() => setOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={descriptionId}
                        tabIndex={-1}
                        className="relative flex max-h-[calc(100dvh-1rem)] w-full select-none flex-col overflow-hidden rounded-none border-2 border-(--card-border) bg-(--card) p-4 pb-[max(1rem,env(safe-area-inset-bottom))]  outline-none sm:max-w-md rounded-none sm:p-5"
                    >
                        <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                                <h3 id={titleId} className="text-base font-semibold sm:text-sm">
                                    复制分享链接
                                </h3>
                                <p id={descriptionId} className="mt-1 text-xs leading-5 text-(--muted)">
                                    输入工具箱地址，生成「工具箱地址#import_project=工坊下载直链」链接，在工具箱中可直接打开。
                                </p>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-none text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg) sm:size-9"
                                aria-label="关闭"
                            >
                                <Icon icon="mdi:close" className="size-5" />
                            </button>
                        </div>

                        <div className="mt-4">
                            <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-(--muted)">
                                工具箱地址
                            </label>
                            <input
                                id={inputId}
                                type="url"
                                inputMode="url"
                                autoComplete="url"
                                spellCheck={false}
                                value={toolUrl}
                                onChange={(e) => setToolUrl(e.target.value)}
                                placeholder="https://wuwa-afyg-tool.200503.xyz"
                                className="min-h-11 w-full select-text rounded-none border-2 border-(--card-border) bg-(--input-bg) px-3 py-2 font-mono text-base outline-none transition-colors focus:border-(--accent) sm:min-h-0 sm:text-sm"
                            />
                            <div className="mt-2 grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap">
                                {INSTANCES.map((inst) => (
                                    <button
                                        key={inst.url}
                                        onClick={() => setToolUrl(inst.url)}
                                        aria-pressed={toolUrl === inst.url}
                                        className={`min-h-10 rounded-none px-2.5 py-1 text-xs transition-colors sm:min-h-0 ${
                                            toolUrl === inst.url
                                                ? 'bg-(--accent) text-(--accent-fg)'
                                                : 'border-2 border-(--card-border) bg-(--card-hover) text-(--muted) hover:text-(--fg)'
                                        }`}
                                    >
                                        {inst.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-4 min-h-0">
                            <span className="mb-1.5 block text-xs font-medium text-(--muted)">生成链接</span>
                            <output
                                className="block max-h-28 select-text overflow-y-auto rounded-none border-2 border-(--card-border) bg-(--card-hover) px-3 py-2.5 font-mono text-[11px] leading-5 break-all text-(--muted)"
                                title={link}
                            >
                                {link}
                            </output>
                        </div>

                        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 sm:flex sm:justify-end">
                            <button
                                onClick={() => setOpen(false)}
                                className="min-h-11 rounded-none border-2 border-(--card-border) bg-(--card) px-3 py-2 text-sm text-(--muted) transition-colors hover:bg-(--card-hover) hover:text-(--fg) sm:min-h-0 sm:py-1.5"
                            >
                                取消
                            </button>
                            <button
                                onClick={copy}
                                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-none px-4 py-2 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all   sm:min-h-0 sm:py-1.5"
                            >
                                <Icon icon="mdi:content-copy" className="size-4" />
                                复制链接
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
