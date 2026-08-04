'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import { toast } from '@/components/ui/toast'

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
    const shareBase = typeof window !== 'undefined' ? window.location.origin : ''
    const downloadUrl = `${shareBase}/share/${code}/download`
    const link = `${toolUrl.replace(/\/+$/, '')}/#import_project=${encodeURIComponent(downloadUrl)}`

    function copy() {
        if (!toolUrl.trim()) {
            toast('请先输入工具箱链接', 'error')
            return
        }
        navigator.clipboard
            .writeText(link)
            .then(() => toast('已复制，可在工具箱中直接打开', 'success'))
            .catch(() => toast('复制失败', 'error'))
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:text-(--fg)"
            >
                <Icon icon="mdi:link-variant" className="size-4" />
                {label}
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
                    <div className="relative w-full max-w-md rounded-xl border border-(--card-border) bg-(--card) p-5 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold">复制分享链接</h3>
                                <p className="mt-1 text-xs text-(--muted)">
                                    输入工具箱地址，生成「工具箱地址#import_project=工坊下载直链」链接，在工具箱中可直接打开。
                                </p>
                            </div>
                            <button onClick={() => setOpen(false)} className="rounded p-1 text-(--muted) hover:text-(--fg)">
                                <Icon icon="mdi:close" className="size-5" />
                            </button>
                        </div>

                        <div className="mt-4">
                            <label className="mb-1 block text-xs text-(--muted)">工具箱地址</label>
                            <input
                                value={toolUrl}
                                onChange={(e) => setToolUrl(e.target.value)}
                                placeholder="https://wuwa-afyg-tool.200503.xyz"
                                className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-(--accent)/60"
                            />
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {INSTANCES.map((inst) => (
                                    <button
                                        key={inst.url}
                                        onClick={() => setToolUrl(inst.url)}
                                        className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                                            toolUrl === inst.url
                                                ? 'bg-(--accent)/15 text-(--accent-text)'
                                                : 'border border-(--card-border) bg-(--card-hover) text-(--muted) hover:text-(--fg)'
                                        }`}
                                    >
                                        {inst.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <p className="mt-3 rounded-lg bg-(--card-hover) px-3 py-2 font-mono text-[10px] leading-relaxed break-all text-(--muted)" title={link}>
                            {link}
                        </p>

                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) hover:text-(--fg)"
                            >
                                取消
                            </button>
                            <button
                                onClick={copy}
                                className="inline-flex items-center gap-1 rounded-lg px-4 py-1.5 text-sm font-medium text-(--btn-text) transition-all hover:brightness-110"
                                style={{ background: 'var(--btn-bg)' }}
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
