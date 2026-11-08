// AI 控制台的 markdown 渲染器（无外部依赖，配合 globals.css 里的 .agent-md 样式）
//
// 支持的块级语法：# 标题（1–4 级）、``` 代码块、> 引用、--- 分隔线、
// - / * 无序列表、1. 有序列表、| 表格、普通段落（空行分段）。
// 行内语法：**粗体**、`代码`、[文字](链接)。
//
// 说明：这是渲染 AI 回复用的最小实现，不追求完整 CommonMark 兼容；
// 遇到不认识的结构一律退化为段落，避免把内容吃掉。
import type { ReactNode } from 'react'

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
    const nodes: ReactNode[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    INLINE.lastIndex = 0
    while ((match = INLINE.exec(text)) !== null) {
        if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
        const token = match[0]
        const key = `${keyPrefix}-${match.index}`

        if (token.startsWith('**')) {
            nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
        } else if (token.startsWith('`')) {
            nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
        } else {
            const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
            if (linkMatch) {
                nodes.push(
                    <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer">
                        {linkMatch[1]}
                    </a>
                )
            } else {
                nodes.push(token)
            }
        }
        lastIndex = match.index + token.length
    }

    if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
    return nodes
}

function splitRow(line: string): string[] {
    return line
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map((cell) => cell.trim())
}

const isTableSeparator = (line: string): boolean => /^\s*\|?[\s:-]+\|[\s:|-]*$/.test(line) && line.includes('-')

export default function Markdown({ text }: { text: string }) {
    const lines = String(text ?? '').split(/\r?\n/)
    const blocks: ReactNode[] = []
    let index = 0
    let key = 0

    while (index < lines.length) {
        const line = lines[index]

        // 空行
        if (!line.trim()) {
            index += 1
            continue
        }

        // 代码块
        if (line.trim().startsWith('```')) {
            const code: string[] = []
            index += 1
            while (index < lines.length && !lines[index].trim().startsWith('```')) {
                code.push(lines[index])
                index += 1
            }
            index += 1
            blocks.push(
                <pre key={`code-${key++}`}>
                    <code>{code.join('\n')}</code>
                </pre>
            )
            continue
        }

        // 标题
        const heading = /^(#{1,4})\s+(.*)$/.exec(line)
        if (heading) {
            const level = heading[1].length
            const content = renderInline(heading[2], `h-${key}`)
            if (level === 1) blocks.push(<h1 key={`block-${key++}`}>{content}</h1>)
            else if (level === 2) blocks.push(<h2 key={`block-${key++}`}>{content}</h2>)
            else if (level === 3) blocks.push(<h3 key={`block-${key++}`}>{content}</h3>)
            else blocks.push(<h4 key={`block-${key++}`}>{content}</h4>)
            index += 1
            continue
        }

        // 分隔线
        if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
            blocks.push(<hr key={`hr-${key++}`} />)
            index += 1
            continue
        }

        // 引用
        if (line.trim().startsWith('>')) {
            const quote: string[] = []
            while (index < lines.length && lines[index].trim().startsWith('>')) {
                quote.push(lines[index].replace(/^\s*>\s?/, ''))
                index += 1
            }
            blocks.push(<blockquote key={`quote-${key++}`}>{renderInline(quote.join(' '), `q-${key}`)}</blockquote>)
            continue
        }

        // 表格
        if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
            const header = splitRow(line)
            index += 2
            const rows: string[][] = []
            while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
                rows.push(splitRow(lines[index]))
                index += 1
            }
            blocks.push(
                <table key={`table-${key++}`}>
                    <thead>
                        <tr>
                            {header.map((cell, cellIndex) => (
                                <th key={cellIndex}>{renderInline(cell, `th-${key}-${cellIndex}`)}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {row.map((cell, cellIndex) => (
                                    <td key={cellIndex}>{renderInline(cell, `td-${key}-${rowIndex}-${cellIndex}`)}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )
            continue
        }

        // 无序列表
        if (/^\s*[-*+]\s+/.test(line)) {
            const items: string[] = []
            while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^\s*[-*+]\s+/, ''))
                index += 1
            }
            blocks.push(
                <ul key={`ul-${key++}`}>
                    {items.map((item, itemIndex) => (
                        <li key={itemIndex}>{renderInline(item, `li-${key}-${itemIndex}`)}</li>
                    ))}
                </ul>
            )
            continue
        }

        // 有序列表
        if (/^\s*\d+[.)]\s+/.test(line)) {
            const items: string[] = []
            while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
                items.push(lines[index].replace(/^\s*\d+[.)]\s+/, ''))
                index += 1
            }
            blocks.push(
                <ol key={`ol-${key++}`}>
                    {items.map((item, itemIndex) => (
                        <li key={itemIndex}>{renderInline(item, `oli-${key}-${itemIndex}`)}</li>
                    ))}
                </ol>
            )
            continue
        }

        // 段落（连续非空行合并）
        const paragraph: string[] = []
        while (index < lines.length && lines[index].trim() && !/^\s*(#{1,4}\s|```|>|[-*+]\s|\d+[.)]\s)/.test(lines[index])) {
            paragraph.push(lines[index])
            index += 1
        }
        if (paragraph.length === 0) {
            // 兜底：认不出的行也吃掉，避免死循环
            paragraph.push(lines[index])
            index += 1
        }
        blocks.push(<p key={`p-${key++}`}>{renderInline(paragraph.join(' '), `p-${key}`)}</p>)
    }

    return <div className="agent-md">{blocks}</div>
}
