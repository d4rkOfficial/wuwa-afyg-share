// 工程标签的**固定集合**：只保留这六种玩法风格，不允许自造标签。
// 上传页与「我的工程」的编辑表单共用（后端 sanitizeTags 只做长度/去重清洗，不做白名单）。
export const PROJECT_TAGS = ['轮切轴', '轮椅轴', '标准轴', '进阶轴', '椰果轴', '特化轴'] as const

export type ProjectTag = (typeof PROJECT_TAGS)[number]
