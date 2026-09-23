'use client'

// 标准词条集 · plan 的 JSON 导入 / 导出面板。
// 导出：把当前编辑中的方案序列化进文本框（便于复制到工具箱或存档）；
// 导入：粘贴整份 plan 后校验并写回编辑器（校验失败只报错，不改动当前方案）。

import { Icon } from '@iconify/react'

interface Props {
    value: string
    onChange: (value: string) => void
    /** 文本框内容的实时校验结果；null = 未填写 */
    status: { ok: boolean; text: string } | null
    onExport: () => void
    onImport: () => void
}

export default function SubstatPlanJson({ value, onChange, status, onExport, onImport }: Props) {
    return (
        <div className="flex flex-col gap-3 mg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mg-section">
                <div className="min-w-0">
                    <span className="flex items-center gap-2 mg-title text-sm">
                        <Icon icon="mdi:code-json" className="size-4 shrink-0 text-(--accent-text)" />
                        JSON 导入 / 导出
                    </span>
                    <p className="text-[11px] text-(--muted)">
                        {`形如 { "slots": [ { cost, mainStat, secondMainStat, substats } ] }：5 个部位、cost {4,3,3,1,1}、副词条合计 14 条`}
                    </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button onClick={onExport} className="toolbar-btn toolbar-btn-ghost">
                        <Icon icon="mdi:export-variant" className="size-3.5" />
                        导出当前方案
                    </button>
                    <button onClick={onImport} className="toolbar-btn toolbar-btn-primary">
                        <Icon icon="mdi:import" className="size-3.5" />
                        校验并导入
                    </button>
                </div>
            </div>

            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                spellCheck={false}
                placeholder='{ "slots": [ … ] }'
                // 管理页 CSS 让 textarea 随内容撑高（field-sizing: content），此处以内联样式改为固定高度内部滚动
                style={{ maxHeight: '26rem', overflow: 'auto' }}
                className="w-full rounded-none border border-(--card-border) bg-(--input-bg) px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none transition-colors focus:border-(--accent)"
            />

            {status && (
                <p className={`text-[11px] ${status.ok ? 'text-(--success)' : 'text-(--danger)'}`}>
                    {status.ok ? '✓ ' : '✕ '}
                    {status.text}
                </p>
            )}
        </div>
    )
}
