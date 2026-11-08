// 工程简介的 Markdown 渲染（详情页用）。
// 解析器在 @/lib/markdown；这里只负责把块级结构画成 .wk-md 里的一串元素。
// 注意：不使用 dangerouslySetInnerHTML —— 简介是用户输入，一切经 React 元素与 href 白名单。
import type { ReactNode } from 'react'
import { parseMarkdown, type MdBlock, type MdInline } from '@/lib/markdown'

function renderInline(inlines: readonly MdInline[]): ReactNode[] {
    return inlines.map((inline, index) => {
        switch (inline.kind) {
            case 'strong':
                return <strong key={index}>{inline.text}</strong>
            case 'em':
                return <em key={index}>{inline.text}</em>
            case 'code':
                return <code key={index}>{inline.text}</code>
            case 'link':
                return (
                    <a key={index} href={inline.href} target="_blank" rel="noreferrer noopener">
                        {inline.text}
                    </a>
                )
            default:
                return <span key={index}>{inline.text}</span>
        }
    })
}

function renderLines(lines: readonly MdInline[][]): ReactNode[] {
    return lines.flatMap((line, index) =>
        index === 0 ? [<span key={0}>{renderInline(line)}</span>] : [<br key={`br-${index}`} />, <span key={index}>{renderInline(line)}</span>]
    )
}

const HEADING_SIZE: Record<number, string> = {
    1: 'var(--wk-t-sec)',
    2: 'var(--wk-t-lead)',
    3: 'var(--wk-t-body)',
    4: 'var(--wk-t-body)',
    5: 'var(--wk-t-body)',
    6: 'var(--wk-t-body)'
}

export default function WkMarkdown({ source }: { source: string }) {
    const blocks: MdBlock[] = parseMarkdown(source)
    if (blocks.length === 0) return null

    return (
        <div className="wk-md">
            {blocks.map((block, index) => {
                switch (block.kind) {
                    case 'h':
                        return (
                            <p
                                key={index}
                                className="wk-md-h"
                                style={{ fontSize: HEADING_SIZE[block.level] ?? 'var(--wk-t-body)' }}
                            >
                                {renderInline(block.inlines)}
                            </p>
                        )
                    case 'ul':
                        return (
                            <ul key={index}>
                                {block.items.map((item, itemIndex) => (
                                    <li key={itemIndex}>{renderInline(item)}</li>
                                ))}
                            </ul>
                        )
                    case 'ol':
                        return (
                            <ol key={index}>
                                {block.items.map((item, itemIndex) => (
                                    <li key={itemIndex}>{renderInline(item)}</li>
                                ))}
                            </ol>
                        )
                    case 'quote':
                        return <blockquote key={index}>{renderLines(block.lines)}</blockquote>
                    case 'code':
                        return (
                            <pre key={index}>
                                <code>{block.text}</code>
                            </pre>
                        )
                    case 'hr':
                        return <hr key={index} />
                    default:
                        return <p key={index}>{renderLines(block.lines)}</p>
                }
            })}
        </div>
    )
}
