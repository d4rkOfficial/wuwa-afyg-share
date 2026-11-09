'use client'

// 设计系统 v2 · 标签输入
// 上传页与「我的工程」编辑弹窗共用，避免两处各写一套 chip 逻辑。
//
// 形态：一个描边编辑框，已选标签是**写在框内的 badge**（实心强调色，右侧 × 可删），
// 光标后面跟一段可输入的空白。下方一行是「n/上限 + 常用标签胶囊」。
// 行为：
// - 回车 / 逗号 / **空格** 成词（三种都算分隔符）；
// - 粘贴 "a, b，c d" 自动拆成多个；
// - 空输入按 Backspace 删最后一个；
// - 常用标签点一下加、再点一下去掉；点框内空白处聚焦输入框。
import { useRef, useState } from 'react'
import { Icon } from '@iconify/react'
import { isImeComposing } from '@/lib/keyboard'

/** @desc 与后端 sanitizeTags 同口径：去掉 #、空白，限长 12 */
function normalizeTag(raw: string): string {
    return raw.trim().replace(/^#+/, '').replace(/\s+/g, '').slice(0, 12)
}

const SPLIT_RE = /[,，\s]+/

export function WkTagInput({
    value,
    onChange,
    suggestions,
    max = 8,
    placeholder = '输入标签，回车 / 逗号 / 空格成词',
    ariaLabel = '标签'
}: {
    value: string[]
    onChange: (next: string[]) => void
    suggestions?: ReadonlyArray<string>
    max?: number
    placeholder?: string
    ariaLabel?: string
}) {
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const full = value.length >= max

    /** @desc 一次加多个（粘贴会拆成数组），去重 + 截断上限 */
    function addMany(rawList: ReadonlyArray<string>) {
        const next = [...value]
        for (const raw of rawList) {
            const tag = normalizeTag(raw)
            if (!tag || next.includes(tag) || next.length >= max) continue
            next.push(tag)
        }
        setDraft('')
        if (next.length !== value.length) onChange(next)
    }

    function toggle(tag: string) {
        onChange(value.includes(tag) ? value.filter((item) => item !== tag) : full ? value : [...value, tag])
    }

    return (
        <div className="wk-tagbox-wrap">
            <div
                className="wk-tagbox"
                onClick={() => inputRef.current?.focus()}
                role="group"
                aria-label={ariaLabel}
            >
                {value.map((tag) => (
                    <span key={tag} className="wk-tagbox-chip">
                        <span className="wk-tagbox-chip-text">#{tag}</span>
                        <button
                            type="button"
                            className="wk-tag-remove"
                            aria-label={`移除标签 ${tag}`}
                            onClick={(event) => {
                                event.stopPropagation()
                                onChange(value.filter((item) => item !== tag))
                            }}
                        >
                            <Icon icon="mdi:close" width={11} height={11} aria-hidden="true" />
                        </button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    className="wk-tagbox-input"
                    aria-label={ariaLabel}
                    value={draft}
                    maxLength={12}
                    disabled={full}
                    placeholder={full ? `已达上限 ${max} 个` : value.length === 0 ? placeholder : ''}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        // 输入法候选阶段的 Enter / 空格属于输入法，不能当成"成词"
                        if (isImeComposing(event)) return
                        if (event.key === 'Enter' || event.key === ',' || event.key === '，' || event.key === ' ') {
                            if (!draft.trim()) {
                                event.preventDefault()
                                return
                            }
                            event.preventDefault()
                            addMany([draft])
                        }
                        if (event.key === 'Backspace' && !draft && value.length > 0) {
                            event.preventDefault()
                            onChange(value.slice(0, -1))
                        }
                    }}
                    onPaste={(event) => {
                        const text = event.clipboardData.getData('text')
                        if (!SPLIT_RE.test(text)) return
                        event.preventDefault()
                        addMany(text.split(SPLIT_RE))
                    }}
                    onBlur={() => addMany([draft])}
                />
            </div>

            <div className="wk-tagbox-meta">
                <span className="wk-tagbox-count">
                    {value.length}/{max}
                </span>
                {suggestions?.map((tag) => {
                    const active = value.includes(tag)
                    return (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => toggle(tag)}
                            aria-pressed={active}
                            disabled={!active && full}
                            className="wk-tag-pick"
                            data-active={active}
                        >
                            {active && <Icon icon="mdi:check" width={11} height={11} aria-hidden="true" />}
                            {tag}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export { normalizeTag }
