import { NextResponse } from 'next/server'

// 兼容旧链接：/download/msi 统一跳转到 coconut-app Release 的 Windows 安装包。
export const dynamic = 'force-dynamic'

const RELEASE_MSI =
    'https://github.com/d4rkOfficial/coconut-app/releases/latest/download/coconut-app-windows-x64.msi'

export function GET() {
    return NextResponse.redirect(RELEASE_MSI, 302)
}
