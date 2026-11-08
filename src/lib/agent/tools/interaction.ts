// AI 控制台的交互工具：ask_user（信息不足时先问人）。
//
// 为什么需要：agent 一次可能改几十条数据，命名风格/范围/是否保留旧条目这类信息它无从判断；
// 与其猜（然后被拒、再重试），不如停下来问一句。回答会作为工具结果回喂给模型。
import type { ToolDefinition } from '@/lib/ai/tools'

export interface AskUserRequest {
    question: string
    options?: string[]
}

export interface InteractionContext {
    /** @desc 弹提问卡并等待回答；用户取消返回 null */
    askUser: (req: AskUserRequest) => Promise<string | null>
}

export const INTERACTION_TOOLS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'ask_user',
            description:
                '向用户提问并等待回答。当信息不足（命名风格、处理范围、是否保留旧条目、是否继续某批操作）时调用，**不要靠猜**。一次只问一个具体问题，可给 2-5 个快捷选项。',
            parameters: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: '要问的具体问题（一句话）' },
                    options: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '可选：2-5 个快捷选项，用户也可自由作答'
                    }
                },
                required: ['question']
            }
        }
    }
]

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function executeInteractionTool(
    ctx: InteractionContext,
    name: string,
    args: Record<string, unknown>
): Promise<{ text: string }> {
    switch (name) {
        case 'ask_user': {
            const question = str(args.question)
            if (!question) return { text: JSON.stringify({ error: 'question 不能为空' }) }
            const options = Array.isArray(args.options)
                ? args.options.filter((o): o is string => typeof o === 'string' && o.trim().length > 0).slice(0, 5)
                : undefined
            const answer = await ctx.askUser({ question, options })
            if (answer === null) return { text: JSON.stringify({ cancelled: true, message: '用户取消了回答' }) }
            return { text: JSON.stringify({ ok: true, question, answer }) }
        }
        default:
            return { text: JSON.stringify({ error: `未知工具：${name}` }) }
    }
}

export const INTERACTION_TOOL_NAMES = new Set(INTERACTION_TOOLS.map((t) => t.function.name))
