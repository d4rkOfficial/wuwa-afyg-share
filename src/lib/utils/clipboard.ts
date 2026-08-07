interface PermissionsPolicyLike {
    allowsFeature(feature: string): boolean
}

type ClipboardPolicyDocument = Document & {
    permissionsPolicy?: PermissionsPolicyLike
    featurePolicy?: PermissionsPolicyLike
}

const clipboardWriteAllowed = () => {
    const policyDocument = document as ClipboardPolicyDocument
    const policy = policyDocument.permissionsPolicy ?? policyDocument.featurePolicy
    try {
        return !policy || policy.allowsFeature('clipboard-write')
    } catch {
        return true
    }
}

const copyWithSelection = (text: string) => {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const selection = document.getSelection()
    const ranges = selection
        ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange())
        : []
    const textarea = document.createElement('textarea')

    textarea.value = text
    textarea.readOnly = true
    textarea.setAttribute('aria-hidden', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    textarea.style.fontSize = '16px'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)

    let copied = false
    try {
        textarea.focus({ preventScroll: true })
        textarea.select()
        textarea.setSelectionRange(0, textarea.value.length)
        copied = document.execCommand('copy')
    } catch {
        copied = false
    } finally {
        textarea.remove()
        selection?.removeAllRanges()
        for (const range of ranges) selection?.addRange(range)
        if (activeElement?.isConnected) activeElement.focus({ preventScroll: true })
    }

    return copied
}

export const copyText = async (text: string) => {
    if (typeof window === 'undefined' || !document.body) return false

    if (window.isSecureContext && clipboardWriteAllowed() && navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text)
            return true
        } catch {
            // Some browsers expose Clipboard API but reject it at runtime.
        }
    }

    return copyWithSelection(text)
}
