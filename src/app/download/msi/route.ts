import { respondWithLauncher } from '@/lib/download/launcher'

// .msi：安装引导程序（.exe 如果闪退则安装这个）
export const dynamic = 'force-dynamic'

const FILE = {
    fileName: '椰果工具箱启动器.msi',
    asciiName: 'ye-guo-toolbox-launcher.msi',
    missingHint: 'MSI 安装包尚未上传，请先下载 .exe 版本。'
}

export async function GET(request: Request) {
    return respondWithLauncher(request, FILE)
}
