'use client'

// 上传工程（新系统）
// 相对旧版的改动：
// 1. 字号全部走 6 档（旧的标题 11px、提示 10px）；
// 2. 发布按钮固定在底部操作条，手机上不用滚到底；
// 3. 拖拽区不再把 <button> 嵌进 role="button" 里（键盘与读屏都会乱）；
// 4. 多行框不可拖拽高度（resize: none + 自动增高）；
// 5. 有文件或输入时拦截离开；
// 6. 选文件前先做类型/大小预校验，错误内联显示，不用整块红条。
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { WkBadge, WkButton, WkField, WkInput, WkSegmented, WkTagInput, WkTextarea } from '@/design'
import { publishProject } from '@/lib/actions/projects'
import { parseProjectFile, safeJsonParse } from '@/lib/project/parse'
import { teamDisplayNames } from '@/lib/project/extract'
import { PROJECT_TAGS } from '@/lib/consts/project-tags'
import type { ProjectData } from '@/lib/types/project'

const MAX_BYTES = 8 * 1024 * 1024
const MAX_TAGS = 8
const PRESETS = [
    { value: '7', label: '7 天' },
    { value: '30', label: '30 天' },
    { value: '90', label: '90 天' },
    { value: '365', label: '1 年' },
    { value: 'perm', label: '永久' }
]

function todayISO(): string {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${now.getFullYear()}-${month}-${day}`
}

function daysFromNow(days: number): string {
    const target = new Date(Date.now() + days * 86_400_000)
    const month = String(target.getMonth() + 1).padStart(2, '0')
    const day = String(target.getDate()).padStart(2, '0')
    return `${target.getFullYear()}-${month}-${day}`
}

/** @desc 日期值 → 当天 23:59:59 的 ISO（东八区）；空串 = 永久 */
function expiryToIso(date: string): string | null {
    return date ? `${date}T23:59:59.999+08:00` : null
}

interface FileMeta {
    name: string
    bytes: number
    preview: ProjectData
    names: string[]
}

export default function UploadForm({ elements }: { elements?: Record<string, string> }) {
    const router = useRouter()
    const fileRef = useRef<HTMLInputElement>(null)

    const [fileText, setFileText] = useState('')
    const [meta, setMeta] = useState<FileMeta | null>(null)
    const [parseError, setParseError] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)

    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [tags, setTags] = useState<string[]>([])
    const [preset, setPreset] = useState('30')
    const [customDate, setCustomDate] = useState(todayISO())

    const [submitError, setSubmitError] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    const expireDate = preset === 'perm' ? '' : preset === 'custom' ? customDate : daysFromNow(Number(preset))
    const dirty = Boolean(meta || title || description || tags.length)

    // 有内容时离开要确认（旧版全站 0 处拦截，误关就白填）
    useEffect(() => {
        if (!dirty) return
        function onBeforeUnload(event: BeforeUnloadEvent) {
            event.preventDefault()
            event.returnValue = ''
        }
        window.addEventListener('beforeunload', onBeforeUnload)
        return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [dirty])

    function readFile(file: File) {
        setParseError(null)
        setSubmitError(null)
        if (!/\.json$/i.test(file.name) && file.type !== 'application/json') {
            setParseError('请选择工具箱导出的 .json 文件')
            return
        }
        if (file.size > MAX_BYTES) {
            setParseError(`文件太大（${(file.size / 1024 / 1024).toFixed(1)} MB），上限 8 MB`)
            return
        }
        const reader = new FileReader()
        reader.onload = () => {
            const text = String(reader.result ?? '')
            try {
                const project = parseProjectFile(safeJsonParse(text))
                setFileText(text)
                setMeta({
                    name: project.name,
                    bytes: new TextEncoder().encode(text).length,
                    preview: project,
                    names: teamDisplayNames({ slots: project.team, names: project.lockedTeamNames ?? [] })
                })
                setTitle('')
                setDescription('')
            } catch (error) {
                setMeta(null)
                setFileText('')
                setParseError(error instanceof Error ? error.message : '解析失败，可能不是工具箱导出的工程文件')
            }
        }
        reader.readAsText(file)
    }

    function onPick(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]
        if (file) readFile(file)
        if (fileRef.current) fileRef.current.value = ''
    }

    function onDrop(event: React.DragEvent<HTMLDivElement>) {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
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
            const result = await publishProject({
                fileText,
                title: title.trim(),
                description: description.trim(),
                tags,
                expiresDays: null,
                expiresAt: expiryToIso(expireDate)
            })
            if (result.error) {
                setSubmitError(result.error)
                return
            }
            router.push(`/share/${result.data!.code}`)
            router.refresh()
        })
    }

    const fileInput = (
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={onPick} style={{ display: 'none' }} />
    )

    // ── 未选文件：居中导入框 ──
    if (!meta) {
        return (
            <div style={{ maxWidth: 560, margin: '0 auto', paddingTop: 24 }}>
                <div
                    onDragOver={(event) => {
                        event.preventDefault()
                        setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                    style={{
                        display: 'grid',
                        gap: 12,
                        justifyItems: 'center',
                        padding: '40px 24px',
                        textAlign: 'center',
                        border: `1px dashed ${dragging ? 'var(--wk-accent)' : 'var(--wk-ctrl-line)'}`,
                        borderRadius: 'var(--wk-r-2)',
                        background: dragging ? 'var(--wk-s2)' : 'var(--wk-s1)',
                        boxShadow: 'var(--wk-elev-1), var(--wk-inset-1)'
                    }}
                >
                    <p style={{ fontSize: 'var(--wk-t-body)' }}>把工具箱导出的 .json 拖到这里</p>
                    <WkButton variant="primary" onClick={() => fileRef.current?.click()}>
                        选择文件
                    </WkButton>
                    <p className="wk-meta">工具箱 →「导出工程」得到文件 · 上限 8 MB</p>
                    {fileInput}
                </div>
                {parseError && (
                    <p style={{ marginTop: 12, color: 'var(--wk-danger)', fontSize: 'var(--wk-t-meta)' }}>{parseError}</p>
                )}
            </div>
        )
    }

    // ── 已选文件：预览 + 分享信息 + 底部发布条 ──
    return (
        <div style={{ display: 'grid', gap: 16, maxWidth: 720, paddingTop: 8 }}>
            <div className="wk-card wk-card-pad">
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {meta.name}
                    </span>
                    <span className="wk-meta">{(meta.bytes / 1024).toFixed(1)} KB</span>
                    <WkButton size="sm" variant="quiet" onClick={() => fileRef.current?.click()}>
                        换文件
                    </WkButton>
                    <WkButton size="sm" variant="quiet" onClick={clearFile}>
                        移除
                    </WkButton>
                </div>

                {meta.names.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                        {meta.names.map((name, slot) => {
                            const element = elements?.[name]
                            return (
                                <span
                                    key={`${name}-${slot}`}
                                    className="wk-badge"
                                    style={
                                        element
                                            ? {
                                                  color: `var(--element-${element})`,
                                                  borderColor: `color-mix(in srgb, var(--element-${element}) 55%, transparent)`
                                              }
                                            : undefined
                                    }
                                >
                                    {name}
                                </span>
                            )
                        })}
                    </div>
                )}

                {meta.preview.lockedTeamNames && meta.preview.lockedTeamNames.length > 0 && (
                    <p className="wk-meta" style={{ marginTop: 8 }}>
                        已锁定配队：{meta.preview.lockedTeamNames.join(' / ')}
                    </p>
                )}
                {fileInput}
            </div>

            <div className="wk-card wk-card-pad" style={{ display: 'grid', gap: 16 }}>
                <WkField label="标题" hint={`留空则用工程名「${meta.name}」`}>
                    <WkInput
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        placeholder="例：今汐·衍射队 23 秒循环"
                        maxLength={60}
                    />
                </WkField>

                <WkField label="简介" hint="有无参考轴视频？操作难度如何？">
                    <WkTextarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="例：默认轴，共鸣回路在第一次变奏后再开"
                        rows={3}
                        maxLength={500}
                    />
                </WkField>

                <WkField label={`标签（${tags.length}/${MAX_TAGS}）`} hint="回车或逗号成词；从常用标签里点选也可以">
                    <WkTagInput value={tags} onChange={setTags} suggestions={PROJECT_TAGS} max={MAX_TAGS} />
                </WkField>

                <WkField
                    label="有效期"
                    hint={
                        expireDate
                            ? `到期日 ${expireDate} 23:59（东八区）后链接自动失效；可随时在「我的工程」改期`
                            : '永久有效，不会自动失效'
                    }
                >
                    <div style={{ display: 'grid', gap: 8 }}>
                        <WkSegmented<string>
                            value={preset}
                            onChange={setPreset}
                            ariaLabel="有效期"
                            options={PRESETS}
                        />
                        <WkInput
                            type="date"
                            value={preset === 'perm' ? '' : expireDate}
                            min={todayISO()}
                            disabled={preset === 'perm'}
                            onChange={(event) => {
                                setCustomDate(event.target.value)
                                setPreset('custom')
                            }}
                            aria-label="自定义到期日期"
                            style={{ maxWidth: 220 }}
                        />
                    </div>
                </WkField>
            </div>

            {submitError && (
                <p style={{ color: 'var(--wk-danger)', fontSize: 'var(--wk-t-meta)' }}>{submitError}</p>
            )}

            <div className="wk-actionbar">
                <span className="wk-meta">{pending ? '发布中…' : '发布后可在「我的工程」里改标题、标签、有效期'}</span>
                <span className="wk-spacer" />
                <WkButton variant="quiet" onClick={() => router.back()} disabled={pending}>
                    取消
                </WkButton>
                <WkButton variant="primary" onClick={onSubmit} disabled={pending}>
                    {pending ? '发布中…' : '发布分享'}
                </WkButton>
            </div>

            {dirty && <WkBadge>草稿不会自动保存</WkBadge>}
        </div>
    )
}
