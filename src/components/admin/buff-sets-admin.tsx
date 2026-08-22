'use client'

import { useState, useEffect } from 'react'
import { Icon } from '@iconify/react'
import BuffEntityGrid from '@/components/admin/buff-entity-grid'
import BuffEntityEditor from '@/components/admin/buff-entity-editor'
import BuffSnapshotPanel from '@/components/admin/buff-snapshot-panel'
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_INITIAL_TASK_PROMPT, DEFAULT_SLANG_DICT } from '@/lib/ai/prompts'
import {
    loadAiConfig,
    saveAiConfig,
    DEFAULT_AI_CONFIG,
    type AiConfig
} from '@/lib/ai/config'
import { toast } from '@/components/ui/toast'
import type { ChatMessage } from '@/lib/ai/deepseek'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

interface Props {
    rows: BuffSetRow[]
    isAdmin: boolean
}

const TOOL_BASE_STORAGE = 'wuwa-afyg:tool-base'
const SYSTEM_PROMPT_STORAGE = 'wuwa-afyg:deepseek-system-prompt'
const INITIAL_TASK_STORAGE = 'wuwa-afyg:deepseek-initial-task'
const SLANG_DICT_STORAGE = 'wuwa-afyg:deepseek-slang-dict'
const SESSION_SHARE_STORAGE = 'wuwa-afyg:ai-session-share'
const TOOL_BASE_DEFAULT = 'http://localhost:5173'

function readStorage(key: string, fallback = ''): string {
    if (typeof window === 'undefined') return fallback
    try {
        return window.localStorage.getItem(key) ?? fallback
    } catch {
        return fallback
    }
}

function entityKey(entityType: string, entityName: string) {
    return `${entityType}/${entityName}`
}

export default function BuffSetsAdmin({ rows, isAdmin }: Props) {
    // AI 连接配置（IndexedDB 持久化；加载后供编辑器使用）
    const [ai, setAi] = useState<AiConfig | null>(null)
    const [aiDraft, setAiDraft] = useState<AiConfig>({ ...DEFAULT_AI_CONFIG })
    const [aiSaving, setAiSaving] = useState(false)
    const [systemPrompt, setSystemPrompt] = useState(() =>
        readStorage(SYSTEM_PROMPT_STORAGE, DEFAULT_SYSTEM_PROMPT)
    )
    const [initialTaskPrompt, setInitialTaskPrompt] = useState(() =>
        readStorage(INITIAL_TASK_STORAGE, DEFAULT_INITIAL_TASK_PROMPT)
    )
    const [slangDict, setSlangDict] = useState(() => readStorage(SLANG_DICT_STORAGE, DEFAULT_SLANG_DICT))
    // 跨实体共享会话：按实体类型分组（system 前缀一致才能命中缓存），默认开启
    const [sessionShare, setSessionShare] = useState(() => readStorage(SESSION_SHARE_STORAGE, '1') === '1')
    const [shareSessions, setShareSessions] = useState<Record<string, ChatMessage[]>>({})
    // 二级弹窗编辑：system / initial / slang
    const [editingPrompt, setEditingPrompt] = useState<'system' | 'initial' | 'slang' | null>(null)
    const [draftText, setDraftText] = useState('')
    const [showConfig, setShowConfig] = useState(false)
    const [selected, setSelected] = useState<{ entityType: BuffEntityType; entityName: string } | null>(null)
    const [editingKey, setEditingKey] = useState<string | null>(null)

    useEffect(() => {
        loadAiConfig().then((c) => {
            setAi({ ...c })
            setAiDraft({ ...c })
        })
    }, [])

    const existingCountMap: Record<string, number> = {}
    for (const r of rows) {
        const key = entityKey(r.entity_type, r.entity_name)
        existingCountMap[key] = (existingCountMap[key] ?? 0) + 1
    }

    async function handleSaveAi() {
        setAiSaving(true)
        const c = await saveAiConfig({ ...aiDraft })
        setAi({ ...c })
        setAiSaving(false)
        toast('AI 配置已保存', 'success')
    }

    function persistSystemPrompt(value: string) {
        setSystemPrompt(value)
        localStorage.setItem(SYSTEM_PROMPT_STORAGE, value)
    }

    function persistInitialTaskPrompt(value: string) {
        setInitialTaskPrompt(value)
        localStorage.setItem(INITIAL_TASK_STORAGE, value)
    }

    function persistSlangDict(value: string) {
        setSlangDict(value)
        localStorage.setItem(SLANG_DICT_STORAGE, value)
    }

    function persistSessionShare(enabled: boolean) {
        setSessionShare(enabled)
        localStorage.setItem(SESSION_SHARE_STORAGE, enabled ? '1' : '0')
    }

    // 会话按完整轮次保留全部历史，不做截断（解除对话轮次上限）
    function trimSession(messages: ChatMessage[]): ChatMessage[] {
        return messages
    }

    function handleSessionUpdate(entityType: BuffEntityType, messages: ChatMessage[]) {
        setShareSessions((prev) => ({ ...prev, [entityType]: trimSession(messages) }))
    }

    const PROMPT_EDITORS = [
        {
            key: 'system' as const,
            label: '系统提示词模板',
            hint: '支持 {ZONE_LIST} {REF_ZONE_LIST} {CONDITION_RULES} 占位符',
            value: systemPrompt,
            minHeight: 320,
            persist: persistSystemPrompt,
            reset: DEFAULT_SYSTEM_PROMPT
        },
        {
            key: 'initial' as const,
            label: '首轮任务指令',
            hint: '支持 {ENTITY_TYPE} {ENTITY_NAME} 占位符',
            value: initialTaskPrompt,
            minHeight: 200,
            persist: persistInitialTaskPrompt,
            reset: DEFAULT_INITIAL_TASK_PROMPT
        },
        {
            key: 'slang' as const,
            label: '黑话词典',
            hint: '每行：原叫法=黑话；行尾可用 // 注释',
            value: slangDict,
            minHeight: 200,
            persist: persistSlangDict,
            reset: DEFAULT_SLANG_DICT
        }
    ]

    const activePromptEditor = PROMPT_EDITORS.find((e) => e.key === editingPrompt) ?? null

    function openPromptEditor(key: 'system' | 'initial' | 'slang') {
        setDraftText(PROMPT_EDITORS.find((e) => e.key === key)?.value ?? '')
        setEditingPrompt(key)
    }

    function savePromptEditor() {
        if (!activePromptEditor) return
        activePromptEditor.persist(draftText)
        setEditingPrompt(null)
    }

    function handleSelect(entity: { entityType: BuffEntityType; entityName: string }) {
        setSelected(entity)
        setEditingKey(entityKey(entity.entityType, entity.entityName))
    }

    const initial = selected
        ? {
              entityType: selected.entityType,
              entityName: selected.entityName,
              buffs: rows.filter(
                  (r) =>
                      r.entity_type === selected.entityType && r.entity_name === selected.entityName
              )
          }
        : null

    return (
        <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
            {/* 顶部工具栏 */}
            <div className="flex shrink-0 items-center justify-between rounded-none border-2 border-(--card-border) bg-(--card) px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium text-(--muted)">实体列表</span>
                <span className="flex items-center gap-2">
                    <BuffSnapshotPanel />
                    <button onClick={() => setShowConfig(true)} className="toolbar-btn toolbar-btn-ghost">
                        <span className="flex items-center gap-1.5">
                            <Icon icon="mdi:cog-outline" className="size-4" />
                            连接配置
                            {false && (
                                <span className="ml-1 rounded border-2 border-(--warning) px-1 py-0.5 text-[9px] text-(--warning)">未配置</span>
                            )}
                        </span>
                        <Icon icon="mdi:cog" className="size-4" />
                    </button>
                </span>
            </div>

            {/* 实体网格 */}
            <div className="min-h-0 flex-1">
                <BuffEntityGrid existingCountMap={existingCountMap} onSelect={handleSelect} />
            </div>

            {/* 编辑弹窗 */}
            {selected && initial && (
                <div className="buff-editor-modal-shell fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 " onClick={() => setSelected(null)} />
                    <div className="buff-editor-modal relative flex h-[92vh] w-[min(98vw,1500px)] flex-col overflow-hidden rounded-none border-2 border-(--card-border) bg-(--card) ">
                        <BuffEntityEditor
                            key={editingKey ?? 'new'}
                            initial={initial}
                            
                            apiKey={ai?.apiKey ?? ''}
                            aiBaseUrl={ai?.baseUrl ?? ''}
                            aiModel={ai?.model ?? ''}
                            systemPrompt={systemPrompt}
                            initialTaskPrompt={initialTaskPrompt}
                            toolPrompts={{}}
                            slangDict={slangDict}
                            reasoningEffort={ai?.reasoningEffort ?? 'medium'}
                            isAdmin={isAdmin}
                            sessionSeed={sessionShare ? shareSessions[selected.entityType] : undefined}
                            onSessionUpdate={(msgs) => handleSessionUpdate(selected.entityType, msgs)}
                            sessionShareEnabled={sessionShare}
                            onEntityDeleted={() => {
                                setSelected(null)
                                setEditingKey(null)
                            }}
                            onclose={() => setSelected(null)}
                        />
                    </div>
                </div>
            )}

            {/* 连接配置弹窗（整个弹窗随内容滚动） */}
            {showConfig && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="fixed inset-0 bg-black/60 " onClick={() => setShowConfig(false)} />
                        <div className="relative mx-auto my-8 w-[calc(100vw-2rem)] max-w-xl rounded-none border-2 border-(--card-border) bg-(--card) p-4 ">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-(--fg)">连接配置</span>
                                <button onClick={() => setShowConfig(false)} className="rounded p-1 text-(--muted) hover:text-(--fg)">
                                    <Icon icon="mdi:close" className="size-5" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <label className="flex flex-col gap-1 text-xs text-(--muted)">
                                    <span className="flex items-center justify-between">
                                        AI 服务地址
                                    </span>
                                    <input
                                        type="url"
                                        value={aiDraft.baseUrl}
                                        onChange={(e) => setAiDraft((d) => ({ ...d, baseUrl: e.target.value }))}
                                        placeholder="https://api.deepseek.com"
                                        className="w-full rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)"
                                    />
                                    <p className="text-[10px] text-(--muted)">支持任意 OpenAI 兼容端点（需支持 POST /chat/completions）</p>
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-(--muted)">
                                    <span className="flex items-center justify-between">
                                        模型名
                                    </span>
                                    <input
                                        type="text"
                                        value={aiDraft.model}
                                        onChange={(e) => setAiDraft((d) => ({ ...d, model: e.target.value }))}
                                        placeholder="deepseek-v4-flash"
                                        className="w-full rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-(--muted)">
                                    AI API Key
                                    <input
                                        type="password"
                                        value={aiDraft.apiKey}
                                        onChange={(e) => setAiDraft((d) => ({ ...d, apiKey: e.target.value }))}
                                        placeholder="sk-..."
                                        className="w-full rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)"
                                    />
                                    <p className="text-[10px] text-(--muted)">
                                        填所选提供商的 API Key（格式 / 获取方式按其官方文档）
                                    </p>
                                </label>
                                <div className="flex flex-col gap-1">
                                    <span className="text-xs text-(--muted)">思考强度</span>
                                    <div className="flex items-center gap-1">
                                        {(['off', 'low', 'medium', 'high'] as const).map((level) => (
                                            <button
                                                key={level}
                                                onClick={() => setAiDraft((d) => ({ ...d, reasoningEffort: level }))}
                                                className={`rounded-none px-2 py-1 text-[11px] transition-colors ${
                                                    aiDraft.reasoningEffort === level
                                                        ? 'bg-(--accent) text-(--accent-fg)'
                                                        : 'text-(--muted) hover:text-(--fg)'
                                                }`}
                                            >
                                                {level === 'off' ? '不传' : level === 'low' ? '低' : level === 'medium' ? '中' : '高'}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-(--muted)">
                                        不传=不发送 reasoning_effort 参数（严格模式的 OpenAI 兼容服务建议选此项）
                                    </p>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={handleSaveAi}
                                        disabled={aiSaving}
                                        className="inline-flex items-center gap-1.5 rounded-none px-4 py-1.5 text-xs font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all  disabled:opacity-50"
                                    >
                                        <Icon icon="mdi:content-save-outline" className="size-3.5" />
                                        {aiSaving ? '保存中…' : '保存 AI 配置'}
                                    </button>
                                </div>
                                {PROMPT_EDITORS.map((editor) => {
                                    const summary = editor.value.trim().replace(/\s+/g, ' ').slice(0, 60)
                                    return (
                                        <div
                                            key={editor.key}
                                            className="flex items-center gap-2 rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2.5 py-2"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs text-(--muted)">{editor.label}</span>
                                                    <button
                                                        onClick={() => editor.persist(editor.reset)}
                                                        className="shrink-0 text-[10px] text-(--accent-text) hover:underline"
                                                    >
                                                        恢复默认
                                                    </button>
                                                </div>
                                                <p className="truncate text-[10px] text-(--muted)" title={editor.value}>
                                                    {summary || `（未填写） ${editor.hint}`}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => openPromptEditor(editor.key)}
                                                className="inline-flex shrink-0 items-center gap-1 rounded-none px-2.5 py-1 text-xs font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all "
                                            >
                                                <Icon icon="mdi:pencil-outline" className="size-3.5" />
                                                编辑
                                            </button>
                                        </div>
                                    )
                                })}
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-(--muted)">跨实体共享会话</span>
                                        <button
                                            onClick={() => persistSessionShare(!sessionShare)}
                                            className={`flex items-center gap-1.5 rounded-none px-2 py-1 text-[11px] transition-colors ${
                                                sessionShare
                                                    ? 'bg-(--accent) text-(--accent-fg)'
                                                    : 'text-(--muted) hover:text-(--fg)'
                                            }`}
                                        >
                                            <Icon
                                                icon={sessionShare ? 'mdi:check-circle' : 'mdi:circle-outline'}
                                                className="size-3.5"
                                            />
                                            {sessionShare ? '开启' : '关闭'}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-(--muted)">
                                        连续生成时复用上一实体会话前缀（按实体类型分组，保留全部历史轮次），命中 AI 缓存、省 token
                                    </p>
                                </div>
                                <p className="text-[10px] text-(--muted)">
                                    提示词与词典仅存本机浏览器。可在编辑时对生成结果追问。
                                </p>
                            </div>

                             <div className="mt-3 flex justify-end border-t-2 border-(--card-border) pt-3">
                                <button
                                    onClick={() => setShowConfig(false)}
                                    className="rounded-none px-4 py-1.5 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all "
                                >
                                    完成
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* 二级弹窗：提示词/任务指令/黑话词典编辑 */}
                {activePromptEditor && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/60 "
                            onClick={() => setEditingPrompt(null)}
                        />
                        <div className="relative flex max-h-[85vh] w-[min(96vw,720px)] flex-col overflow-hidden rounded-none border-2 border-(--card-border) bg-(--card) ">
                            <div className="flex items-center justify-between border-b-2 border-(--card-border) px-4 py-3">
                                <span className="text-sm font-semibold text-(--fg)">{activePromptEditor.label}</span>
                                <button
                                    onClick={() => setEditingPrompt(null)}
                                    className="rounded p-1 text-(--muted) transition-colors hover:text-(--fg)"
                                >
                                    <Icon icon="mdi:close" className="size-5" />
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                                <p className="mb-2 text-[10px] text-(--muted)">{activePromptEditor.hint}</p>
                                <textarea
                                    value={draftText}
                                    onChange={(e) => setDraftText(e.target.value)}
                                    autoFocus
                                    placeholder={activePromptEditor.hint}
                                    className="w-full rounded-none border-2 border-(--card-border) bg-(--input-bg) px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-(--accent)"
                                    style={{ minHeight: `${activePromptEditor.minHeight}px` }}
                                />
                            </div>
                            <div className="flex items-center justify-between border-t-2 border-(--card-border) px-4 py-3">
                                <button
                                    onClick={() => {
                                        setDraftText(activePromptEditor.reset)
                                        activePromptEditor.persist(activePromptEditor.reset)
                                    }}
                                    className="text-[10px] text-(--accent-text) hover:underline"
                                >
                                    恢复默认
                                </button>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setEditingPrompt(null)}
                                        className="rounded-none px-3 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={savePromptEditor}
                                        className="rounded-none px-4 py-1.5 text-sm font-medium border-2 border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all "
                                    >
                                        保存
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    )
}
