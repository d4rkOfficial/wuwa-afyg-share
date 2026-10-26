'use client'

// 标签输入。两种模式：
// 1) `options` 给定 → **固定选项多选**（工程标签只允许这几个，不能自造）；
// 2) 不给 → 自由输入（回车 / 逗号 / 空格成词，粘贴自动拆分，可一键补常用词）。
// 上限与后端口径一致（最多 8 个、每个 ≤ 12 字）。
import { useRef, useState } from 'react'
import { Icon } from '@iconify/react'

export const MAX_TAGS = 8

interface Props {
    tags: string[]
    onChange: (tags: string[]) => void
    /** @desc 固定可选项（给了就是「只能从这些里选」模式） */
    options?: string[]
    /** @desc 自由模式下的常用词（点一下追加） */
    suggestions?: string[]
    placeholder?: string
    disabled?: boolean
}

/** @desc 清洗单个标签（与后端 sanitizeTags 同口径：去空白、限长 12） */
function normalizeTag(raw: string): string {
    return raw.trim().replace(/^#+/, '').replace(/\s+/g, '').slice(0, 12)
}

export default function TagInput({
    tags,
    onChange,
    options,
    suggestions = [],
    placeholder,
    disabled
}: Props) {
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    // ── 固定选项模式：只能选 / 取消这几个标签 ──
    if (options && options.length > 0) {
        return (
            <div className="flex flex-wrap gap-1.5">
                {options.map((option) => {
                    const active = tags.includes(option)
                    return (
                        <button
                            key={option}
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                                onChange(
                                    active
                                        ? tags.filter((t) => t !== option)
                                        : tags.length >= MAX_TAGS
                                          ? tags
                                          : [...tags, option]
                                )
                            }
                            aria-pressed={active}
                            className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                                active
                                    ? 'border-(--accent) bg-(--accent) text-(--accent-fg)'
                                    : 'border-(--card-border) bg-(--card) text-(--muted) hover:border-(--accent) hover:text-(--fg)'
                            }`}
                        >
                            {active && <Icon icon="mdi:check" className="size-3" />}
                            {option}
                        </button>
                    )
                })}
            </div>
        )
    }

    // ── 自由输入模式 ──
    function addTag(raw: string) {
        const tag = normalizeTag(raw)
        if (!tag) return
        if (tags.includes(tag) || tags.length >= MAX_TAGS) {
            setDraft('')
            return
        }
        onChange([...tags, tag])
        setDraft('')
    }

    function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        // 回车 / 逗号 / 空格 = 成词；Backspace 空输入时删最后一个
        if (e.key === 'Enter' || e.key === ',' || e.key === '，' || e.key === ' ') {
            if (draft.trim()) {
                e.preventDefault()
                addTag(draft)
            }
            return
        }
        if (e.key === 'Backspace' && !draft && tags.length > 0) {
            e.preventDefault()
            onChange(tags.slice(0, -1))
        }
    }

    function removeTag(tag: string) {
        onChange(tags.filter((t) => t !== tag))
    }

    // 粘贴「a,b,c」一次性拆成多个标签
    function onPaste(e: React.ClipboardEvent<HTMLInputElement>) {
        const text = e.clipboardData.getData('text')
        if (!/[,，\s]/.test(text)) return
        e.preventDefault()
        const parts = text.split(/[,，\s]+/).filter(Boolean)
        const next = [...tags]
        for (const part of parts) {
            const tag = normalizeTag(part)
            if (tag && !next.includes(tag) && next.length < MAX_TAGS) next.push(tag)
        }
        onChange(next)
        setDraft('')
    }

    const remaining = suggestions.filter((s) => !tags.includes(s)).slice(0, 12)

    return (
        <div className="space-y-2">
            <div
                onClick={() => inputRef.current?.focus()}
                className={`flex min-h-10 flex-wrap items-center gap-1.5 rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1.5 transition-colors ${
                    disabled ? 'opacity-60' : 'focus-within:border-(--accent)'
                }`}
            >
                {tags.map((tag) => (
                    <span
                        key={tag}
                        className="inline-flex max-w-full items-center gap-1 rounded-sm bg-(--accent) px-1.5 py-0.5 text-[11px] text-(--accent-fg)"
                    >
                        <span className="max-w-40 truncate">#{tag}</span>
                        {!disabled && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    removeTag(tag)
                                }}
                                className="opacity-70 transition-opacity hover:opacity-100"
                                aria-label={`移除标签 ${tag}`}
                            >
                                <Icon icon="mdi:close" className="size-3" />
                            </button>
                        )}
                    </span>
                ))}
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                    onBlur={() => draft.trim() && addTag(draft)}
                    disabled={disabled || tags.length >= MAX_TAGS}
                    placeholder={
                        tags.length >= MAX_TAGS
                            ? `已达上限 ${MAX_TAGS} 个`
                            : (placeholder ?? '输入标签，回车 / 逗号成词')
                    }
                    className="min-w-32 flex-1 bg-transparent px-0.5 text-sm outline-none placeholder:text-(--muted) disabled:cursor-not-allowed"
                    maxLength={12}
                />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-(--muted)">
                    {tags.length}/{MAX_TAGS}
                </span>
                {remaining.map((s) => (
                    <button
                        key={s}
                        type="button"
                        disabled={disabled || tags.length >= MAX_TAGS}
                        onClick={() => addTag(s)}
                        className="rounded-sm border border-(--card-border) bg-(--card) px-1.5 py-0.5 text-[11px] text-(--muted) transition-colors hover:border-(--accent) hover:text-(--fg) disabled:opacity-40"
                    >
                        + {s}
                    </button>
                ))}
            </div>
        </div>
    )
}
