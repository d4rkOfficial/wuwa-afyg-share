// 角色名 → 属性（由 scripts/generate-char-elements.mjs 生成，勿手改）
// 数据版本：3.7.1
export const CHAR_ELEMENTS: Record<string, string> = {
    "爱弥斯": "热熔",
    "安可": "热熔",
    "奥古斯塔": "导电",
    "白芷": "冷凝",
    "卜灵": "导电",
    "布兰特": "热熔",
    "炽霞": "热熔",
    "仇远": "气动",
    "椿": "湮灭",
    "达妮娅": "热熔",
    "丹瑾": "湮灭",
    "灯灯": "导电",
    "绯雪": "冷凝",
    "菲比": "衍射",
    "弗洛洛": "湮灭",
    "忌炎": "气动",
    "嘉贝莉娜": "热熔",
    "鉴心": "气动",
    "今汐": "衍射",
    "景燃": "热熔",
    "卡卡罗": "导电",
    "卡提希娅": "气动",
    "坎特蕾拉": "湮灭",
    "珂莱塔": "冷凝",
    "丽贝卡": "导电",
    "琳奈": "衍射",
    "凌阳": "冷凝",
    "陆·赫斯": "衍射",
    "露帕": "热熔",
    "露西": "衍射",
    "洛可可": "湮灭",
    "洛瑟菈": "冷凝",
    "莫宁": "热熔",
    "莫特斐": "热熔",
    "漂泊者·导电": "导电",
    "漂泊者·气动": "气动",
    "漂泊者·湮灭": "湮灭",
    "漂泊者·衍射": "衍射",
    "千咲": "湮灭",
    "清宵": "气动",
    "秋水": "气动",
    "散华": "冷凝",
    "守岸人": "衍射",
    "穗穗": "冷凝",
    "锁暝": "导电",
    "桃祈": "湮灭",
    "维里奈": "衍射",
    "西格莉卡": "气动",
    "夏空": "气动",
    "相里要": "导电",
    "心": "导电",
    "秧秧": "气动",
    "秧秧·玄翎": "湮灭",
    "吟霖": "导电",
    "尤诺": "气动",
    "釉瑚": "冷凝",
    "渊武": "导电",
    "赞妮": "衍射",
    "长离": "热熔",
    "折枝": "冷凝",
}

const CHAR_ELEMENTS_CACHE_KEY = 'wuwa-afyg:char-elements'
let latestElementsPromise: Promise<Record<string, string>> | null = null

async function getLatestElements(): Promise<Record<string, string>> {
    if (typeof window === 'undefined') return CHAR_ELEMENTS
    if (latestElementsPromise) return latestElementsPromise

    latestElementsPromise = fetch('/api/char-elements', { cache: 'no-store' })
        .then((response) => {
            if (!response.ok) throw new Error('角色数据获取失败')
            return response.json() as Promise<{ elements?: unknown }>
        })
        .then((data) => {
            if (!data.elements || typeof data.elements !== 'object') throw new Error('角色数据格式错误')
            const elements = data.elements as Record<string, string>
            try { localStorage.setItem(CHAR_ELEMENTS_CACHE_KEY, JSON.stringify({ elements })) } catch {}
            return elements
        })
        .catch(() => {
            try {
                const cached = JSON.parse(localStorage.getItem(CHAR_ELEMENTS_CACHE_KEY) ?? "") as { elements?: unknown }
                if (cached.elements && typeof cached.elements === 'object') return cached.elements as Record<string, string>
            } catch {}
            return CHAR_ELEMENTS
        })
    return latestElementsPromise
}

export async function charElement(name: string): Promise<string> {
    const elements = await getLatestElements()
    return elements[name] ?? ''
}
