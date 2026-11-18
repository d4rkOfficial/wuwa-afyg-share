import { NextResponse } from 'next/server'

// 兼容旧链接：/download 统一跳转到 coconut-app Release 的 Windows 便携版。
// 安装包不再放本站 public/downloads，全部由 coconut-app 的 GitHub Actions 构建并发布。
export const dynamic = 'force-dynamic'

const RELEASE_EXE =
    'https://github.com/d4rkOfficial/coconut-app/releases/latest/download/coconut-app-windows-x64.exe'

export function GET() {
    return NextResponse.redirect(RELEASE_EXE, 302)
}
