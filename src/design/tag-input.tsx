'use client'

// 设计系统 v2 · 标签输入
// 上传页与「我的工程」编辑弹窗共用，避免两处各写一套 chip 逻辑。
import { useState } from 'react'
import { cn } from './cn'
import { WkInput } from './form'

export function WkTagInput({
    value,
    onChange,
    suggestions,
    max = 8,
    placeholder = '输入后回车',
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

    function add(raw: string) {
        const next = raw.trim().replace(/^#/, '')
        setDraft('')
        if (!next || value.length >= max || value.includes(next)) return
        onChange([...value, next])
    }

    const remaining = (suggestions ?? []).filter((tag) => !value.includes(tag))

    return (
        <div style={{ display: 'grid', gap: 8 }}>
            <WkInput
                value={draft}
                aria-label={ariaLabel}
                placeholder={placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
                        event.preventDefault()
                        add(draft)
                    }
                    if (event.key === 'Backspace' && !draft && value.length > 0) {
                        onChange(value.slice(0, -1))
                    }
                }}
                onBlur={() => add(draft)}
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

            {remaining.length > 0 && value.length < max && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {remaining.slice(0, 8).map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() => add(tag)}
                            className={cn('wk-badge')}
                            style={{ cursor: 'pointer', background: 'transparent' }}
                        >
                            + {tag}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
