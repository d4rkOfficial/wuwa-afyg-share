'use client'

import { useEffect, useRef } from 'react'
import { normalizeShareBuffName } from '@/lib/buff-names'

interface Props {
    value: string
    onCommit: (value: string) => void
    placeholder?: string
}

/** @desc Buff 集路径式名称输入：contenteditable 单行，文件夹段加粗、`\` 淡化，提交时纠正语法 */
export default function BuffPathInput({ value, onCommit, placeholder = '文件夹\\Buff名' }: Props) {
    const ref = useRef<HTMLDivElement>(null)
    const focusedRef = useRef(false)
    const composingRef = useRef(false)

    const textOf = (): string => ref.current?.innerText.replaceAll('\n', '') ?? ''

    const caretOffset = (): number => {
        const el = ref.current
        if (!el) return 0
        const sel = window.getSelection()
        if (!sel?.rangeCount) return 0
        const range = sel.getRangeAt(0)
        const pre = range.cloneRange()
        pre.selectNodeContents(el)
        pre.setEnd(range.endContainer, range.endOffset)
        return pre.toString().length
    }

    const setCaret = (offset: number) => {
        const el = ref.current
        if (!el) return
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        let remaining = Math.max(0, offset)
        let node = walker.nextNode()
        while (node) {
            const len = node.textContent?.length ?? 0
            if (remaining <= len) {
                const range = document.createRange()
                range.setStart(node, remaining)
                range.collapse(true)
                const sel = window.getSelection()
                sel?.removeAllRanges()
                sel?.addRange(range)
                return
            }
            remaining -= len
            node = walker.nextNode()
        }
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
    }

    const appendPart = (el: HTMLDivElement, text: string, bold: boolean, sep: boolean) => {
        const span = document.createElement('span')
        span.textContent = text
        if (bold) span.className = 'font-bold'
        if (sep) span.className = 'opacity-35'
        el.appendChild(span)
    }

    const render = (text: string, caret?: number) => {
        const el = ref.current
        if (!el) return
        const parts = text.split('\\')
        el.replaceChildren()
        parts.forEach((part, index) => {
            if (index > 0) appendPart(el, '\\', false, true)
            appendPart(el, part, index < parts.length - 1, false)
        })
        if (caret !== undefined) setCaret(caret)
    }

    const commit = () => {
        const next = normalizeShareBuffName(textOf())
        if (!next) {
            render(value)
            return
        }
        render(next)
        if (next !== value) onCommit(next)
    }

    useEffect(() => {
        if (!focusedRef.current) render(value)
    }, [value])

    return (
        <div
            ref={ref}
            contentEditable
            role="textbox"
            tabIndex={0}
            spellCheck={false}
            data-placeholder={placeholder}
            className="min-w-0 flex-1 cursor-text whitespace-pre-wrap break-all rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1 text-sm leading-6 text-(--fg) outline-none empty:before:pointer-events-none empty:before:text-(--muted) empty:before:content-[attr(data-placeholder)] focus:border-(--accent)"
            onInput={() => {
                if (composingRef.current) return
                const caret = caretOffset()
                render(textOf(), caret)
            }}
            onFocus={() => {
                focusedRef.current = true
                render(value)
                setCaret(value.length)
            }}
            onBlur={() => {
                focusedRef.current = false
                commit()
            }}
            onCompositionStart={() => {
                composingRef.current = true
            }}
            onCompositionEnd={() => {
                composingRef.current = false
                const caret = caretOffset()
                render(textOf(), caret)
            }}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    ref.current?.blur()
                } else if (e.key === 'Escape') {
                    e.preventDefault()
                    render(value)
                    ref.current?.blur()
                }
            }}
            onPaste={(e) => {
                e.preventDefault()
                const text = e.clipboardData.getData('text')
                document.execCommand('insertText', false, text)
            }}
        />
    )
}
