'use client'

// 设计系统 v2 · 标签输入
// 上传页与「我的工程」编辑弹窗共用，避免两处各写一套 chip 逻辑。
//
// 行为对齐重构前的版本：
// - 回车 / 逗号 / **空格** 成词（三种都算分隔符）；
// - 粘贴 "a, b，c d" 自动拆成多个；
// - 空输入按 Backspace 删最后一个；
// - 常用标签是可点的胶囊（未选中是描边、选中是实心 + 勾），点一下加、再点一下去掉。
import { useState } from 'react'
import { Icon } from '@iconify/react'
import { WkInput } from './form'
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
    placeholder = '回车 / 逗号 / 空格成词',
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
        onChange(value.includes(tag) ? value.filter((item) => item !== tag) : value.length >= max ? value : [...value, tag])
    }

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <WkInput
                value={draft}
                aria-label={ariaLabel}
                placeholder={placeholder}
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

            {value.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {value.map((tag) => (
                        <span key={tag} className="wk-badge" style={{ gap: 6 }}>
                            #{tag}
                            <button
                                type="button"
                                onClick={() => onChange(value.filter((item) => item !== tag))}
                                aria-label={`移除标签 ${tag}`}
                                className="wk-tag-remove"
                            >
                                ×
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {suggestions && suggestions.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {suggestions.map((tag) => {
                        const active = value.includes(tag)
                        return (
                            <button
                                key={tag}
                                type="button"
                                onClick={() => toggle(tag)}
                                aria-pressed={active}
                                disabled={!active && value.length >= max}
                                className="wk-tag-pick"
                                data-active={active}
                            >
                                {active && <Icon icon="mdi:check" width={11} height={11} aria-hidden="true" />}
                                {tag}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export { normalizeTag }
