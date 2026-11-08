'use client'

// 「在工具箱中打开」弹窗（新系统）
// 旧版只给一条「工具箱深链」，全站没有任何地方能复制 /share/{code} 这条普通分享链接，
// 结果发给朋友时会得到一条看起来像坏掉的链接。这里两条都提供，并明确区分用途。
import { useState } from 'react'
import { WkButton, WkDialog, WkDropdown, WkField, WkInput } from '@/design'
import WkCopyButton from './copy-button'

const INSTANCES = [
    { name: '主站', url: 'https://wuwa-afyg-tool.200503.xyz' },
    { name: '副站', url: 'https://wuwa-hpyg-tool.200503.xyz' },
    { name: '本地', url: 'http://localhost:5173' },
    { name: '自定义', url: '' }
]

export default function ShareLinkDialog({ code }: { code: string }) {
    const [open, setOpen] = useState(false)
    const [instance, setInstance] = useState(INSTANCES[0].name)
    const [customUrl, setCustomUrl] = useState('')

    const origin = typeof window === 'undefined' ? '' : window.location.origin
    const pageUrl = `${origin}/share/${code}`
    const downloadUrl = `${origin}/share/${code}/download`
    const toolUrl = instance === '自定义' ? customUrl.trim() : (INSTANCES.find((item) => item.name === instance)?.url ?? '')
    const deepLink = toolUrl
        ? `${toolUrl.replace(/\/+$/, '')}/#import_project=${encodeURIComponent(downloadUrl)}`
        : ''

    return (
        <>
            <WkButton variant="primary" onClick={() => setOpen(true)}>
                在工具箱中打开
            </WkButton>

            <WkDialog
                open={open}
                onClose={() => setOpen(false)}
                title="在工具箱中打开"
                footer={
                    <>
                        <WkCopyButton text={pageUrl} label="复制页面链接" variant="outline" />
                        <span style={{ flex: 1 }} />
                        <WkButton variant="quiet" onClick={() => setOpen(false)}>
                            关闭
                        </WkButton>
                    </>
                }
            >
                <WkField label="工具箱实例">
                    <WkDropdown
                        value={instance}
                        ariaLabel="工具箱实例"
                        onChange={(next) => setInstance(next)}
                        options={INSTANCES.map((item) => ({
                            value: item.name,
                            label: item.url ? `${item.name} · ${item.url}` : item.name
                        }))}
                    />
                </WkField>

                {instance === '自定义' && (
                    <WkField label="工具箱地址" hint="填到端口为止，不用带 #">
                        <WkInput
                            value={customUrl}
                            onChange={(event) => setCustomUrl(event.target.value)}
                            placeholder="https://example.com"
                        />
                    </WkField>
                )}

                <WkField label="一键导入链接" hint="打开后工具箱会自动导入这个工程；需要工具箱处于运行状态">
                    <div
                        className="wk-meta"
                        style={{
                            border: '1px solid var(--wk-line)',
                            borderRadius: 'var(--wk-r-1)',
                            background: 'var(--wk-s2)',
                            padding: '8px 10px',
                            maxHeight: 96,
                            overflowY: 'auto',
                            wordBreak: 'break-all',
                            userSelect: 'all'
                        }}
                    >
                        {deepLink || '请先填写工具箱地址'}
                    </div>
                </WkField>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <WkCopyButton text={deepLink} label="复制一键导入链接" variant="primary" />
                    <span className="wk-meta" style={{ alignSelf: 'center' }}>
                        页面链接：{pageUrl}
                    </span>
                </div>
            </WkDialog>
        </>
    )
}
