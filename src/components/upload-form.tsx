'use client'

// 上传工程
// 1) 未导入文件：**居中**展示一个导入框（点击 / 拖入 .json）；
// 2) 导入之后：居中展示工程详情 + 分享信息编辑区；原来那块大导入区收成详情区里的**小框**，
//    用于重新选择 / 拖入文件。
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import TeamBanner from '@/components/team-banner'
import TagInput from '@/components/ui/tag-input'
import ExpiryPicker, { daysFromNow, expiryDateToIso } from '@/components/ui/expiry-picker'
import { publishProject } from '@/lib/actions/projects'
import { parseProjectFile, safeJsonParse } from '@/lib/project/parse'
import { teamDisplayNames } from '@/lib/project/extract'
import { PROJECT_TAGS } from '@/lib/consts/project-tags'
import type { ProjectData } from '@/lib/types/project'

const TAG_SUGGESTIONS = [...PROJECT_TAGS]

interface FileMeta {
    name: string
    bytes: number
    preview: ProjectData
    names: string[]
}

export default function UploadForm() {
    const router = useRouter()
    const fileRef = useRef<HTMLInputElement>(null)

    const [fileText, setFileText] = useState('')
    const [meta, setMeta] = useState<FileMeta | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)

    // 分享信息（上传前可改）
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [expireDate, setExpireDate] = useState(() => daysFromNow(30))

    const [submitError, setSubmitError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    function readFile(file: File) {
        const reader = new FileReader()
        reader.onload = () => {
            const text = String(reader.result ?? '')
            setFileText(text)
            setParseError(null)
            setSubmitError(null)
            try {
                const project = parseProjectFile(safeJsonParse(text))
                setMeta({
                    name: project.name,
                    bytes: new TextEncoder().encode(text).length,
                    preview: project,
                    names: teamDisplayNames({ slots: project.team, names: project.lockedTeamNames ?? [] })
                })
                setTitle('')
                setDescription('')
            } catch (e) {
                setMeta(null)
                setParseError(e instanceof Error ? e.message : '解析失败')
            }
        }
        reader.readAsText(file)
    }

    function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        readFile(file)
        if (fileRef.current) fileRef.current.value = ''
    }

    function onDrop(e: React.DragEvent<HTMLElement>) {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) readFile(file)
    }

    function clearFile() {
        setFileText('')
        setMeta(null)
        setParseError(null)
        setTitle('')
        setDescription('')
        setTags([])
    }

    function onSubmit() {
        if (!meta) return
        setSubmitError(null)
        startTransition(async () => {
            const res = await publishProject({
                fileText,
                title: title.trim(),
                description: description.trim(),
                tags,
                expiresDays: null,
                expiresAt: expiryDateToIso(expireDate)
            })
            if (res.error) {
                setSubmitError(res.error)
                return
            }
            router.push(`/share/${res.data!.code}`)
            router.refresh()
        })
    }

    const sizeText = useMemo(() => (meta ? `${(meta.bytes / 1024).toFixed(1)} KB` : ''), [meta])
    const titlePlaceholder = meta?.name ?? '工程标题'

    const dragProps = {
        onDragOver: (e: React.DragEvent<HTMLElement>) => {
            e.preventDefault()
            setDragging(true)
        },
        onDragLeave: () => setDragging(false),
        onDrop
    }

    const dragClass = dragging
        ? 'border-(--accent) bg-(--card-hover)'
        : 'border-(--card-border) bg-(--card-hover) hover:border-(--accent)'

    const fileInput = (
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFileChange} />
    )

    // ── 未导入：居中大导入框 ──
    if (!meta) {
        return (
            <div className="flex min-h-[52vh] items-center justify-center">
                <div className="w-full max-w-xl space-y-3">
                    <div
                        {...dragProps}
                        onClick={() => fileRef.current?.click()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                fileRef.current?.click()
                            }
                        }}
                        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border border-dashed px-6 py-14 text-center transition-colors ${dragClass}`}
                    >
                        <Icon icon="mdi:file-upload-outline" className="size-10 text-(--muted)" />
                        <p className="text-sm text-(--fg)">
                            {dragging ? '松开即可导入' : '拖入，或点击选择工具箱导出的 .json'}
                        </p>
                        <p className="text-[11px] text-(--muted)">工具箱 →「导出工程」得到文件</p>
                    </div>
                    {fileInput}
                    {parseError && (
                        <div className="flex items-start gap-2 rounded-sm border border-(--danger) bg-(--danger) px-3 py-2 text-sm text-(--danger-fg)">
                            <Icon icon="mdi:alert-circle-outline" className="mt-0.5 size-4 shrink-0" />
                            <span className="min-w-0 flex-1">{parseError}</span>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // ── 已导入：居中详情 + 编辑区 ──
    return (
        <div className="mx-auto max-w-3xl space-y-3">
            {/* 工程详情（含「重新选择 / 拖入」小框） */}
            <div className="mg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <Icon icon="mdi:check-circle-outline" className="size-4 shrink-0 text-(--success)" />
                    <span className="mg-title min-w-0 flex-1 truncate text-sm">{meta.name}</span>
                    <span className="mg-num shrink-0 text-[11px] text-(--muted)">{sizeText}</span>
                </div>
                <div className="mt-2.5">
                    <TeamBanner names={meta.names} />
                </div>
                {meta.preview.lockedTeamNames && meta.preview.lockedTeamNames.length > 0 && (
                    <p className="mt-1 text-[11px] text-(--muted)">
                        已锁定配队：{meta.preview.lockedTeamNames.join(' / ')}
                    </p>
                )}

                {/* 小框：重新选择 / 拖入文件 */}
                <div
                    {...dragProps}
                    onClick={() => fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            fileRef.current?.click()
                        }
                    }}
                    className={`mt-3 flex cursor-pointer items-center gap-2 rounded-sm border border-dashed px-3 py-2 text-[11px] text-(--muted) transition-colors ${dragClass}`}
                >
                    <Icon icon="mdi:swap-horizontal" className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                        {dragging ? '松开即可替换文件' : '重新选择或拖入 .json（替换当前工程文件）'}
                    </span>
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            clearFile()
                        }}
                        className="shrink-0 rounded-sm border border-(--card-border) px-1.5 py-0.5 transition-colors hover:text-(--fg)"
                    >
                        移除
                    </button>
                </div>
                {fileInput}
            </div>

            {/* 分享信息 */}
            <div className="mg-card p-4">
                <div className="mg-section">
                    <Icon icon="mdi:tag-multiple-outline" className="size-4 shrink-0 text-(--accent-text)" />
                    <h2 className="mg-title text-sm">分享信息</h2>
                </div>

                <div className="space-y-3">
                    <label className="block">
                        <span className="mb-1 block text-[11px] text-(--muted)">标题</span>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder={titlePlaceholder}
                            maxLength={60}
                            className="w-full rounded-sm border border-(--card-border) bg-(--input-bg) px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)"
                        />
                        <span className="mt-1 block text-[10px] text-(--muted)">
                            留空则用工程名「{titlePlaceholder}」
                        </span>
                    </label>

                    <label className="block">
                        <span className="mb-1 block text-[11px] text-(--muted)">简介</span>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="有无参考轴视频？操作难度如何？"
                            rows={3}
                            maxLength={500}
                            className="w-full rounded-sm border border-(--card-border) bg-(--input-bg) px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-(--muted) focus:border-(--accent)"
                        />
                    </label>

                    <div>
                        <span className="mb-1 block text-[11px] text-(--muted)">标签</span>
                        <TagInput
                            tags={tags}
                            onChange={setTags}
                            suggestions={TAG_SUGGESTIONS}
                            placeholder="回车 / 逗号成词，最多 8 个"
                        />
                    </div>

                    <div>
                        <span className="mb-1 block text-[11px] text-(--muted)">有效期</span>
                        <ExpiryPicker value={expireDate} onChange={setExpireDate} disabled={pending} />
                    </div>
                </div>
            </div>

            {submitError && (
                <div className="flex items-start gap-2 rounded-sm border border-(--danger) bg-(--danger) px-3 py-2 text-sm text-(--danger-fg)">
                    <Icon icon="mdi:alert-circle-outline" className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0 flex-1">{submitError}</span>
                </div>
            )}

            <div className="flex items-center justify-end gap-2">
                <button
                    onClick={() => router.back()}
                    className="rounded-sm border border-(--card-border) bg-(--card) px-3 py-2 text-sm text-(--muted) transition-colors hover:text-(--fg)"
                >
                    取消
                </button>
                <button
                    onClick={onSubmit}
                    disabled={pending}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--btn-bg) px-4 py-2 text-sm font-medium text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) disabled:opacity-50"
                >
                    <Icon
                        icon={pending ? 'mdi:loading' : 'mdi:publish'}
                        className={`size-4 ${pending ? 'animate-spin' : ''}`}
                    />
                    {pending ? '发布中…' : '发布分享'}
                </button>
            </div>
        </div>
    )
}
