'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import TeamBanner from '@/components/team-banner'
import { publishProject } from '@/lib/actions/projects'
import { parseProjectFile, safeJsonParse } from '@/lib/project/parse'
import { teamDisplayNames } from '@/lib/project/extract'
import type { ProjectData } from '@/lib/types/project'

const EXPIRY_OPTIONS = [
    { days: 7, label: '+7 天' },
    { days: 30, label: '+30 天' },
    { days: 90, label: '+90 天' }
]

function toDateInput(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

export default function UploadForm() {
    const router = useRouter()
    const fileRef = useRef<HTMLInputElement>(null)

    const [fileText, setFileText] = useState('')
    const [parseError, setParseError] = useState<string | null>(null)
    const [preview, setPreview] = useState<ProjectData | null>(null)

    const [description, setDescription] = useState('')
    const [tagsText, setTagsText] = useState('')
    // 过期日期（YYYY-MM-DD），空串 = 永久
    const [expireDate, setExpireDate] = useState(() => toDateInput(new Date(Date.now() + 30 * 86400000)))

    const [submitError, setSubmitError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function onTextChange(text: string) {
        setFileText(text)
        setParseError(null)
        setPreview(null)
        if (!text.trim()) return
        try {
            const project = parseProjectFile(safeJsonParse(text))
            setPreview(project)
        } catch (e) {
            setParseError(e instanceof Error ? e.message : '解析失败')
        }
    }

    function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => onTextChange(String(reader.result ?? ''))
        reader.readAsText(file)
        if (fileRef.current) fileRef.current.value = ''
    }

    function onSubmit() {
        if (!preview) return
        setSubmitError(null)
        startTransition(async () => {
            const tags = tagsText
                .split(/[,，\s]+/)
                .map((t) => t.trim())
                .filter(Boolean)
            const expiresAt = expireDate ? `${expireDate}T23:59:59.999+08:00` : null
            const res = await publishProject({ fileText, description, tags, expiresDays: null, expiresAt })
            if (res.error) {
                setSubmitError(res.error)
                return
            }
            router.push(`/share/${res.data!.code}`)
            router.refresh()
        })
    }

    const names = preview
        ? teamDisplayNames({ slots: preview.team, names: preview.lockedTeamNames ?? [] })
        : []

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-(--card-border) bg-(--card) p-6">
                <h2 className="mb-1 text-base font-semibold">1. 选择工程文件</h2>
                <p className="mb-4 text-xs text-(--muted)">
                    在椰果工具箱中「导出」工程获得 .json 文件，或直接粘贴其内容。
                </p>

                <div className="flex flex-col gap-3">
                    <button
                        onClick={() => fileRef.current?.click()}
                        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-(--card-border) bg-(--card-hover) px-4 py-8 text-sm text-(--muted) transition-colors hover:border-(--accent)/50 hover:text-(--fg)"
                    >
                        <Icon icon="mdi:file-upload-outline" className="size-6" />
                        点击选择导出的 .json 文件
                    </button>
                    <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFileChange} />

                    <textarea
                        value={fileText}
                        onChange={(e) => onTextChange(e.target.value)}
                        placeholder="……或直接粘贴工程 JSON 内容"
                        rows={5}
                        className="w-full rounded-xl border border-(--card-border) bg-(--input-bg) px-3 py-2.5 font-mono text-xs outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
                    />
                </div>

                {parseError && (
                    <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                        {parseError}
                    </div>
                )}

                {preview && (
                    <div className="mt-4 space-y-3 rounded-xl bg-(--card-hover) p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{preview.name}</span>
                            <span className="text-xs text-(--muted)">
                                {(new TextEncoder().encode(fileText).length / 1024).toFixed(1)} KB
                            </span>
                        </div>
                        <p className="text-xs text-amber-500/90">
                            提示：项目名建议不要直接写三个角色名（如「绯雪 / 守岸人 / 维里奈」），此类名称可被自动检测出来；可在工具内重命名工程后再导出。
                        </p>
                        <TeamBanner names={names} />
                        {preview.lockedTeamNames && (
                            <p className="text-xs text-(--muted)">已锁定配队：{preview.lockedTeamNames.join(' / ')}</p>
                        )}
                    </div>
                )}
            </div>

            <div className="rounded-xl border border-(--card-border) bg-(--card) p-6">
                <h2 className="mb-4 text-base font-semibold">2. 分享信息</h2>

                <div className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-sm text-(--muted)">简介</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="简单介绍这个工程，比如说有无参考轴视频？"
                            rows={3}
                            maxLength={500}
                            className="w-full rounded-xl border border-(--card-border) bg-(--input-bg) px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm text-(--muted)">标签（逗号分隔，最多 8 个）</label>
                        <input
                            value={tagsText}
                            onChange={(e) => setTagsText(e.target.value)}
                            placeholder="椰果轴,轮椅轴,"
                            className="w-full rounded-xl border border-(--card-border) bg-(--input-bg) px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)/60"
                        />
                    </div>

                    <div>
                        <label className="mb-1.5 block text-sm text-(--muted)">过期日期</label>
                        <div className="flex flex-wrap items-center gap-2">
                            {EXPIRY_OPTIONS.map((opt) => (
                                <button
                                    key={opt.label}
                                    onClick={() => setExpireDate(toDateInput(new Date(Date.now() + opt.days * 86400000)))}
                                    className="rounded-lg border border-(--card-border) bg-(--card) px-3 py-1.5 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                                >
                                    {opt.label}
                                </button>
                            ))}
                            <input
                                type="date"
                                value={expireDate}
                                onChange={(e) => setExpireDate(e.target.value)}
                                className="rounded-lg border border-(--card-border) bg-(--input-bg) px-3 py-1.5 text-sm outline-none transition-colors focus:border-(--accent)/60"
                            />
                            <button
                                onClick={() => setExpireDate('')}
                                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                                    !expireDate
                                        ? 'bg-(--accent) text-(--accent-fg)'
                                        : 'border border-(--card-border) bg-(--card) text-(--muted) hover:text-(--fg)'
                                }`}
                            >
                                永久
                            </button>
                        </div>
                        <p className="mt-1.5 text-xs text-(--muted)">到期后分享链接将自动失效，可在「我的工程」中随时改期。</p>
                    </div>
                </div>
            </div>

            {submitError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {submitError}
                </div>
            )}

            <div className="flex justify-end gap-2">
                <button
                    onClick={() => router.back()}
                    className="rounded-lg border border-(--card-border) bg-(--card) px-4 py-2 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                >
                    取消
                </button>
                <button
                    onClick={onSubmit}
                    disabled={!preview || pending}
                    className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium text-(--btn-text) disabled:opacity-40"
                    style={{ background: 'var(--btn-bg)' }}
                >
                    <Icon icon={pending ? 'mdi:loading' : 'mdi:publish'} className={`size-4 ${pending ? 'animate-spin' : ''}`} />
                    发布分享
                </button>
            </div>
        </div>
    )
}
