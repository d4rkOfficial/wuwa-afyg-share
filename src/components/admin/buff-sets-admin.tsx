'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import BuffEntitySidebar from '@/components/admin/buff-entity-sidebar'
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
import { setBuffSetLock } from '@/lib/actions/edit-locks'
import type { ChatMessage } from '@/lib/ai/client'
import type { EntityIconMaps } from '@/lib/data/avatar-icons'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

interface Props {
    rows: BuffSetRow[]
    isAdmin: boolean
    /** @desc 被管理员单独锁定的 buff 实体（key = `类型/名称`）；锁定的条目普通用户不能编辑 */
    buffLocks: Record<string, boolean>
    /** @desc 四类实体的图标表（列表里每个实体都显示图标） */
    entityIcons?: EntityIconMaps
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

export default function BuffSetsAdmin({ rows, isAdmin, buffLocks, entityIcons }: Props) {
    const router = useRouter()
    const [lockPending, startTransition] = useTransition()
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
        // 条目级锁：普通用户点开被锁实体直接拦下（管理员可照常编辑）
        if (!isAdmin && buffLocks[entityKey(entity.entityType, entity.entityName)]) {
            toast(`「${entity.entityName}」的 Buff 集已被管理员锁定，仅管理员可编辑`, 'error')
            return
        }
        setSelected(entity)
        setEditingKey(entityKey(entity.entityType, entity.entityName))
    }

    /** @desc 管理员逐个实体开关条目级锁 */
    function toggleEntityLock(entityType: BuffEntityType, entityName: string) {
        const key = entityKey(entityType, entityName)
        const next = !buffLocks[key]
        startTransition(async () => {
            const res = await setBuffSetLock(entityType, entityName, next)
            if (res.error) {
                toast(res.error, 'error')
                return
            }
            toast(next ? `已锁定「${entityName}」` : `已解锁「${entityName}」`, 'success')
            router.refresh()
        })
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
        <div className="space-y-4">
            {/* 顶部工具栏 */}
            <div className="flex shrink-0 items-center justify-between mg-card px-4 py-2.5">
                <span className="flex items-center gap-2">
                    <Icon icon="mdi:view-grid-outline" className="size-4 shrink-0 text-(--accent-text)" />
                    <span className="mg-title text-sm">Buff 集编辑</span>
                </span>
                <span className="flex items-center gap-2">
                    {/* 快照（根 + 版本链）严格仅管理员：普通用户无权动快照 */}
                    {isAdmin && <BuffSnapshotPanel />}
                    <button onClick={() => setShowConfig(true)} className="toolbar-btn toolbar-btn-ghost">
                        <span className="flex items-center gap-1.5">
                            <Icon icon="mdi:cog-outline" className="size-4" />
                            连接配置
                        </span>
                    </button>
                </span>
            </div>

            {/* 工作台：左侧实体 sidebar + 右侧就地编辑器（不再用弹窗） */}
            <div className="workbench items-stretch">
                <BuffEntitySidebar
                    existingCountMap={existingCountMap}
                    selectedKey={editingKey}
                    onSelect={handleSelect}
                    isAdmin={isAdmin}
                    locks={buffLocks}
                    lockPending={lockPending}
                    onToggleLock={toggleEntityLock}
                    entityIcons={entityIcons}
                />

                <section className="workbench-main">
                    {selected && initial ? (
                        <div className="h-[calc(100dvh-13rem)] min-h-[32rem]">
                            <BuffEntityEditor
                                key={editingKey ?? 'new'}
                                initial={initial}
                                apiKey={ai?.apiKey ?? ''}
                                aiBaseUrl={ai?.baseUrl ?? ''}
                                aiModel={ai?.model ?? ''}
                                aiDirect={ai?.direct ?? false}
                                systemPrompt={systemPrompt}
                                initialTaskPrompt={initialTaskPrompt}
                                toolPrompts={{}}
                                slangDict={slangDict}
                                reasoningEffort={ai?.reasoningEffort ?? 'medium'}
                                isAdmin={isAdmin}
                                canEdit={
                                    isAdmin ||
                                    !buffLocks[entityKey(selected.entityType, selected.entityName)]
                                }
                                sessionSeed={sessionShare ? shareSessions[selected.entityType] : undefined}
                                onSessionUpdate={(msgs) => handleSessionUpdate(selected.entityType, msgs)}
                                sessionShareEnabled={sessionShare}
                                onEntityDeleted={() => {
                                    setSelected(null)
                                    setEditingKey(null)
                                }}
                                onclose={() => {
                                    setSelected(null)
                                    setEditingKey(null)
                                }}
                            />
                        </div>
                    ) : (
                        <div className="flex h-full min-h-[32rem] flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-(--card-border) p-8 text-center">
                            <Icon icon="mdi:cursor-default-click-outline" className="size-9 text-(--muted)" />
                            <p className="text-sm text-(--muted)">选择一个实体开始编辑</p>
                            <p className="text-xs text-(--muted)">
                                还没有条目的实体：切「全部实体」后点选，即可新建
                            </p>
                        </div>
                    )}
                </section>
            </div>

            {/* 连接配置弹窗（整个弹窗随内容滚动） */}
            {showConfig && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="fixed inset-0 bg-(--overlay) " onClick={() => setShowConfig(false)} />
                        <div className="relative mx-auto my-8 w-[calc(100vw-2rem)] max-w-xl mg-card p-4 ">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="flex items-center gap-2 mg-title text-sm">
                                    <Icon icon="mdi:cog-outline" className="size-4 shrink-0 text-(--accent-text)" />
                                    连接配置
                                </span>
                                <button onClick={() => setShowConfig(false)} className="rounded-sm p-1 text-(--muted) hover:text-(--fg)">
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
                                        className="w-full rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)"
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
                                        className="w-full rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-(--muted)">
                                    AI API Key
                                    <input
                                        type="password"
                                        value={aiDraft.apiKey}
                                        onChange={(e) => setAiDraft((d) => ({ ...d, apiKey: e.target.value }))}
                                        placeholder="sk-..."
                                        className="w-full rounded-sm border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)"
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
                                                className={`rounded-sm px-2 py-1 text-[11px] transition-colors ${
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
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-(--muted)">浏览器直连</span>
                                        <button
                                            onClick={() => setAiDraft((d) => ({ ...d, direct: !d.direct }))}
                                            className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] transition-colors ${
                                                aiDraft.direct
                                                    ? 'bg-(--accent) text-(--accent-fg)'
                                                    : 'text-(--muted) hover:text-(--fg)'
                                            }`}
                                        >
                                            <Icon
                                                icon={aiDraft.direct ? 'mdi:check-circle' : 'mdi:circle-outline'}
                                                className="size-3.5"
                                            />
                                            {aiDraft.direct ? '直连' : '经站点代理'}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-(--muted)">
                                        直连不经 `/api/ai/stream` 转发（少一跳、不受平台时长限制），但端点必须自己允许 CORS；
                                        失败时改回代理即可。也可在编辑面板右上角快速切换。
                                    </p>
                                </div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={handleSaveAi}
                                        disabled={aiSaving}
                                        className="inline-flex items-center gap-1.5 rounded-sm px-4 py-1.5 text-xs font-medium border border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all  disabled:opacity-50"
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
                                            className="flex items-center gap-2 rounded-sm border border-(--card-border) bg-(--input-bg) px-2.5 py-2"
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
                                                className="inline-flex shrink-0 items-center gap-1 rounded-sm px-2.5 py-1 text-xs font-medium border border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all "
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
                                            className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-[11px] transition-colors ${
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

                             <div className="mt-3 flex justify-end border-t border-(--card-border) pt-3">
                                <button
                                    onClick={() => setShowConfig(false)}
                                    className="rounded-sm px-4 py-1.5 text-sm font-medium border border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all "
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
                            className="absolute inset-0 bg-(--overlay) "
                            onClick={() => setEditingPrompt(null)}
                        />
                        <div className="relative flex max-h-[85vh] w-[min(96vw,720px)] flex-col overflow-hidden mg-card ">
                            <div className="flex items-center justify-between border-b border-(--card-border) px-4 py-3">
                                <span className="flex items-center gap-2 mg-title text-sm">
                                    <Icon icon="mdi:text-box-edit-outline" className="size-4 shrink-0 text-(--accent-text)" />
                                    {activePromptEditor.label}
                                </span>
                                <button
                                    onClick={() => setEditingPrompt(null)}
                                    className="rounded-sm p-1 text-(--muted) transition-colors hover:text-(--fg)"
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
                                    className="w-full rounded-sm border border-(--card-border) bg-(--input-bg) px-2.5 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-(--accent)"
                                    style={{ minHeight: `${activePromptEditor.minHeight}px` }}
                                />
                            </div>
                            <div className="flex items-center justify-between border-t border-(--card-border) px-4 py-3">
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
                                        className="rounded-sm px-3 py-1.5 text-xs text-(--muted) transition-colors hover:text-(--fg)"
                                    >
                                        取消
                                    </button>
                                    <button
                                        onClick={savePromptEditor}
                                        className="rounded-sm px-4 py-1.5 text-sm font-medium border border-(--card-border) bg-(--btn-bg) text-(--btn-text) transition-colors hover:bg-(--card) hover:text-(--fg) transition-all "
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
