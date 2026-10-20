import { respondWithLauncher } from '@/lib/download/launcher'

// .exe：最小化单文件可执行程序（确保依赖全齐时下载这个）
export const dynamic = 'force-dynamic'

const FILE = {
    fileName: '椰果工具箱启动器.exe',
    asciiName: 'ye-guo-toolbox-launcher.exe',
    missingHint: '启动器文件缺失，请稍后重试或改用 .msi 安装包。'
}

export async function GET(request: Request) {
    return respondWithLauncher(request, FILE)
}
