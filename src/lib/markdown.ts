/**
 * @desc 轻量 Markdown（工程简介用）。只实现真正需要的子集，不引第三方库。
 *
 * 两个消费者口味不同：
 *  - 详情页 `<WkMarkdown>`：完整渲染（标题 / 段落 / 列表 / 引用 / 代码 / 分隔线 + 行内强调、代码、链接）；
 *  - 广场卡片 `toCardSegments`：卡片只有两行，所有标记都是噪点 —— **只保留换行与链接**，
 *    其余标记一律剥成纯文本；链接原样保留，卡片上可以点。
 *
 * 渲染全部走 React 元素（不用 dangerouslySetInnerHTML），href 只放行 http(s)/mailto，
 * 所以简介里的 HTML 与 `javascript:` 链接都不会被当成代码执行。
 */

export type MdInline =
    | { kind: 'text'; text: string }
    | { kind: 'strong'; text: string }
    | { kind: 'em'; text: string }
    | { kind: 'code'; text: string }
    | { kind: 'link'; text: string; href: string }

export type MdBlock =
    | { kind: 'p'; lines: MdInline[][] }
    | { kind: 'h'; level: number; inlines: MdInline[] }
    | { kind: 'quote'; lines: MdInline[][] }
    | { kind: 'ul'; items: MdInline[][] }
    | { kind: 'ol'; items: MdInline[][] }
    | { kind: 'code'; text: string; lang?: string }
    | { kind: 'hr' }

const SAFE_HREF = /^(https?:\/\/|mailto:)/i

function pushText(out: MdInline[], text: string): void {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.kind === 'text') {
        out[out.length - 1] = { kind: 'text', text: last.text + text }
        return
    }
    out.push({ kind: 'text', text })
}

/** 行内解析：代码 → 图片（只留替代文字）→ 链接 → 裸链 → 粗体 / 斜体 / 删除线 */
export function parseInline(source: string): MdInline[] {
    const out: MdInline[] = []
    const text = String(source ?? '')
    let i = 0
    while (i < text.length) {
        const rest = text.slice(i)
        let match: RegExpExecArray | null

        if ((match = /^`([^`\n]+)`/.exec(rest))) {
            out.push({ kind: 'code', text: match[1] })
            i += match[0].length
            continue
        }
        // 图片：不外链加载，只把替代文字留在原地
        if ((match = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest))) {
            pushText(out, match[1])
            i += match[0].length
            continue
        }
        if ((match = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest))) {
            const label = match[1] || match[2]
            if (SAFE_HREF.test(match[2])) out.push({ kind: 'link', text: label, href: match[2] })
            else pushText(out, label)
            i += match[0].length
            continue
        }
        if ((match = /^https?:\/\/[^\s<>()（）「」，。；、]+/.exec(rest))) {
            out.push({ kind: 'link', text: match[0], href: match[0] })
            i += match[0].length
            continue
        }
        if ((match = /^\*\*([^*\n]+)\*\*/.exec(rest) ?? /^__([^_\n]+)__/.exec(rest))) {
            out.push({ kind: 'strong', text: match[1] })
            i += match[0].length
            continue
        }
        if ((match = /^\*([^*\n]+)\*/.exec(rest) ?? /^_([^_\n]+)_/.exec(rest))) {
            out.push({ kind: 'em', text: match[1] })
            i += match[0].length
            continue
        }
        if ((match = /^~~([^~\n]+)~~/.exec(rest))) {
            pushText(out, match[1])
            i += match[0].length
            continue
        }

        pushText(out, text[i])
        i += 1
    }
    return out
}

export function parseMarkdown(source: string): MdBlock[] {
    const lines = String(source ?? '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
    const blocks: MdBlock[] = []
    let para: MdInline[][] = []
    let quote: MdInline[][] = []
    let list: { kind: 'ul' | 'ol'; items: MdInline[][] } | null = null

    const flushPara = () => {
        if (para.length > 0) {
            blocks.push({ kind: 'p', lines: para })
            para = []
        }
    }
    const flushQuote = () => {
        if (quote.length > 0) {
            blocks.push({ kind: 'quote', lines: quote })
            quote = []
        }
    }
    const flushList = () => {
        if (list) {
            blocks.push(list)
            list = null
        }
    }
    const flushAll = () => {
        flushPara()
        flushQuote()
        flushList()
    }

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].replace(/\s+$/, '')
        const trimmed = line.trim()

        if (trimmed.startsWith('```')) {
            flushAll()
            const lang = trimmed.slice(3).trim()
            const buffer: string[] = []
            index += 1
            while (index < lines.length && !lines[index].trim().startsWith('```')) {
                buffer.push(lines[index])
                index += 1
            }
            blocks.push({ kind: 'code', text: buffer.join('\n'), lang: lang || undefined })
            continue
        }

        if (!trimmed) {
            flushAll()
            continue
        }

        const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
        if (heading) {
            flushAll()
            blocks.push({ kind: 'h', level: heading[1].length, inlines: parseInline(heading[2]) })
            continue
        }

        if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
            flushAll()
            blocks.push({ kind: 'hr' })
            continue
        }

        const quoted = /^>\s?(.*)$/.exec(trimmed)
        if (quoted) {
            flushPara()
            flushList()
            quote.push(parseInline(quoted[1]))
            continue
        }

        const bullet = /^[-*+]\s+(.*)$/.exec(trimmed)
        if (bullet) {
            flushPara()
            flushQuote()
            if (!list || list.kind !== 'ul') {
                flushList()
                list = { kind: 'ul', items: [] }
            }
            list.items.push(parseInline(bullet[1]))
            continue
        }

        const ordered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
        if (ordered) {
            flushPara()
            flushQuote()
            if (!list || list.kind !== 'ol') {
                flushList()
                list = { kind: 'ol', items: [] }
            }
            list.items.push(parseInline(ordered[1]))
            continue
        }

        flushQuote()
        flushList()
        para.push(parseInline(line))
    }

    flushAll()
    return blocks
}

// ── 卡片：只留换行 + 链接 ────────────────────────────────────────────────

export type MdCardSegment = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string }

function flattenInline(inlines: readonly MdInline[], out: MdCardSegment[]): void {
    for (const inline of inlines) {
        if (inline.kind === 'link') out.push({ kind: 'link', text: inline.text, href: inline.href })
        else out.push({ kind: 'text', text: inline.text })
    }
}

function mergeText(segments: readonly MdCardSegment[]): MdCardSegment[] {
    const out: MdCardSegment[] = []
    for (const segment of segments) {
        const last = out[out.length - 1]
        if (segment.kind === 'text' && last && last.kind === 'text') {
            out[out.length - 1] = { kind: 'text', text: last.text + segment.text }
            continue
        }
        out.push(segment)
    }
    return out
}

/**
 * @desc 卡片用的简介：剥掉全部 Markdown 标记，**换行与链接保留**。
 * 卡片按两行截断，所以长文本只出现前两行；链接若落在两行内则点得动。
 */
export function toCardSegments(source: string): MdCardSegment[] {
    const blocks = parseMarkdown(source)
    const out: MdCardSegment[] = []
    let started = false
    const breakLine = () => {
        if (started) out.push({ kind: 'text', text: '\n' })
        started = true
    }

    for (const block of blocks) {
        if (block.kind === 'hr') continue
        breakLine()
        if (block.kind === 'code') {
            out.push({ kind: 'text', text: block.text })
            continue
        }
        if (block.kind === 'h') {
            flattenInline(block.inlines, out)
            continue
        }
        const lines = block.kind === 'p' || block.kind === 'quote' ? block.lines : block.items
        lines.forEach((line, index) => {
            if (index > 0) out.push({ kind: 'text', text: '\n' })
            flattenInline(line, out)
        })
    }

    return mergeText(out)
}

/** @desc 纯文本（meta description、搜索结果等场景） */
export function markdownToPlainText(source: string): string {
    return toCardSegments(source)
        .map((segment) => segment.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function truncate(text: string, max: number): string {
    const chars = [...text]
    return chars.length > max ? chars.slice(0, max).join('') : text
}

/**
 * @desc 卡片最省空间的形态：**有链接时**只取第一条链接，展示成固定的三个字「超链接」，
 * 前后文各截一段（默认 60 / 40 字）。这样：
 *  - 链接一定落在两行之内（不会被长前缀挤到第三行而看不见）；
 *  - 标签长度固定，卡片宽度不会因为链接文字很长而抖动；
 *  - 真实 URL 放在 `title` 里，悬停可见。
 * 没有链接时原样返回，交给卡片的 `-webkit-line-clamp` 截断。
 */
export function toCardPreview(
    source: string,
    options: { linkLabel?: string; maxBefore?: number; maxAfter?: number } = {}
): MdCardSegment[] {
    const { linkLabel = '超链接', maxBefore = 60, maxAfter = 40 } = options
    const segments = toCardSegments(source)
    const linkIndex = segments.findIndex((segment) => segment.kind === 'link')
    if (linkIndex < 0) return segments

    const link = segments[linkIndex] as { kind: 'link'; text: string; href: string }
    const before = segments
        .slice(0, linkIndex)
        .map((segment) => segment.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
    const after = segments
        .slice(linkIndex + 1)
        .map((segment) => segment.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()

    const out: MdCardSegment[] = []
    if (before) {
        const head = truncate(before, maxBefore)
        out.push({ kind: 'text', text: head.length < before.length ? `${head}…` : `${head} ` })
    }
    out.push({ kind: 'link', text: linkLabel, href: link.href })
    if (after) {
        const tail = truncate(after, maxAfter)
        out.push({ kind: 'text', text: ` ${tail}${tail.length < after.length ? '…' : ''}` })
    }
    return out
}
