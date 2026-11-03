import { respondWithLauncher } from '@/lib/download/launcher'

// 路径保持 /download；实际返回 zip（内含 exe + 免费模型插件）
export const dynamic = 'force-dynamic'

const FILE = {
    fileName: '椰果工具箱启动器-exe.zip',
    asciiName: 'ye-guo-toolbox-launcher-exe.zip',
    missingHint: '启动器压缩包缺失，请稍后重试。'
}

export async function GET(request: Request) {
    return respondWithLauncher(request, FILE)
}
