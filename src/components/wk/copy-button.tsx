'use client'

// 复制到剪贴板按钮（新系统）：统一的成功/失败反馈，避免各页各写一套
import { useState } from 'react'
import { WkButton, wkToast } from '@/design'
import { copyText } from '@/lib/utils/clipboard'

export default function WkCopyButton({
    text,
    path,
    label = '复制',
    copiedLabel = '已复制',
    variant = 'quiet',
    size = 'md'
}: {
    /** @desc 要复制的完整文本（与 path 二选一） */
    text?: string
    /** @desc 站内路径：点击时再拼 origin，避免服务端渲染时拿不到域名 */
    path?: string
    label?: string
    copiedLabel?: string
    variant?: 'outline' | 'primary' | 'quiet' | 'danger'
    size?: 'md' | 'sm'
}) {
    const [copied, setCopied] = useState(false)

    async function copy() {
        const value = path ? `${window.location.origin}${path}` : (text ?? '')
        if (!value) return
        const ok = await copyText(value)
        if (!ok) {
            wkToast('复制失败，请手动选择文本复制', 'error')
            return
        }
        setCopied(true)
        wkToast('已复制到剪贴板', 'ok')
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <WkButton variant={variant} size={size} onClick={copy}>
            {copied ? copiedLabel : label}
        </WkButton>
    )
}
