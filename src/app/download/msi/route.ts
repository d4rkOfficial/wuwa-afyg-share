import { respondWithLauncher } from '@/lib/download/launcher'

// 路径保持 /download/msi；实际返回 zip（内含 msi + 免费模型插件）
export const dynamic = 'force-dynamic'

const FILE = {
    fileName: '椰果工具箱启动器-msi.zip',
    asciiName: 'ye-guo-toolbox-launcher-msi.zip',
    missingHint: '安装包压缩文件缺失，请稍后重试。'
}

export async function GET(request: Request) {
    return respondWithLauncher(request, FILE)
}
