import { brotliCompressSync, brotliDecompressSync } from 'node:zlib'

// 原始工程文件上限 5MB
export const MAX_RAW_BYTES = 5 * 1024 * 1024
// 压缩后存储上限 0.5MB
export const MAX_STORED_BYTES = 512 * 1024

const HEX_PREFIX = '\\x'

export class ProjectCompressError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'ProjectCompressError'
    }
}

export interface CompressedProject {
    blob: Buffer
    blobHex: string
}

/** 压缩前校验原始大小并抛错 */
export function assertRawSize(text: string): void {
    const bytes = new TextEncoder().encode(text).length
    if (bytes > MAX_RAW_BYTES) {
        throw new ProjectCompressError('工程文件超过 5MB 限制')
    }
}

/** brotli 无损压缩，压缩后超上限抛错 */
export function compressProjectText(text: string): CompressedProject {
    assertRawSize(text)
    const blob = brotliCompressSync(Buffer.from(text, 'utf8'))
    if (blob.length > MAX_STORED_BYTES) {
        throw new ProjectCompressError('工程压缩后仍过大')
    }
    return { blob, blobHex: toBlobHex(blob) }
}

/** 解压为完整原始文本 */
export function decompressProject(value: string | ArrayBuffer): string {
    const buf = fromBlob(value)
    return brotliDecompressSync(buf).toString('utf8')
}

/** bytea → Buffer（PostgREST JSON 下表现为 "\x<hex>" 字符串，也可能是 ArrayBuffer） */
export function fromBlob(value: string | ArrayBuffer): Buffer {
    if (typeof value !== 'string') return Buffer.from(value)
    const hex = value.startsWith(HEX_PREFIX) ? value.slice(HEX_PREFIX.length) : value
    return Buffer.from(hex, 'hex')
}

/** Buffer → bytea 十六进制字符串 */
export function toBlobHex(buf: Buffer): string {
    return HEX_PREFIX + buf.toString('hex')
}
