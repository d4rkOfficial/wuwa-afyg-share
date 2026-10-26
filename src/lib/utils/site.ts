export function siteUrl(): string {
    return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://wuwa-afyg-share.200503.xyz'
}

/** 简表速览：跳转工具箱 fast-calc，并带上该工程的下载地址供其导入 */
export function fastCalcUrl(projectCode: string): string {
    const downloadUrl = `${siteUrl()}/share/${projectCode}/download`
    return `http://wuwa-afyg-tool.200503.xyz/fast-calc?import_project=${encodeURIComponent(downloadUrl)}`
}
