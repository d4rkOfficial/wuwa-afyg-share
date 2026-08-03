'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import BuffEntitySidebar from '@/components/admin/buff-entity-sidebar'
import BuffEntityEditor from '@/components/admin/buff-entity-editor'
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_INITIAL_TASK_PROMPT, DEFAULT_SLANG_DICT } from '@/lib/ai/prompts'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

interface Props {
    rows: BuffSetRow[]
    isAdmin: boolean
}

const AI_KEY_STORAGE = 'wuwa-afyg:deepseek-api-key'
const TOOL_BASE_STORAGE = 'wuwa-afyg:tool-base'
const SYSTEM_PROMPT_STORAGE = 'wuwa-afyg:deepseek-system-prompt'
const INITIAL_TASK_STORAGE = 'wuwa-afyg:deepseek-initial-task'
const SLANG_DICT_STORAGE = 'wuwa-afyg:deepseek-slang-dict'
const TOOL_PROMPTS_STORAGE = 'wuwa-afyg:deepseek-tool-prompts'
const TOOL_BASE_DEFAULT = 'http://localhost:5173'

// 可配置 description 的工具清单（名称 → 默认描述占位）
const CONFIGURABLE_TOOLS = [
    'list_entities',
    'search_entities',
    'get_entity_info',
    'get_character_terms',
    'get_buff_sets',
    'get_editing_context',
    'diff_buffs',
    'get_zone',
    'get_effects',
    'get_scope_rules',
    'get_slang_dict',
    'get_naming_rules',
    'get_examples'
] as const

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
    const [toolBase, setToolBase] = useState(() => readStorage(TOOL_BASE_STORAGE, TOOL_BASE_DEFAULT))
    const [apiKey, setApiKey] = useState(() => readStorage(AI_KEY_STORAGE))
    const [systemPrompt, setSystemPrompt] = useState(() =>
        readStorage(SYSTEM_PROMPT_STORAGE, DEFAULT_SYSTEM_PROMPT)
    )
    const [initialTaskPrompt, setInitialTaskPrompt] = useState(() =>
        readStorage(INITIAL_TASK_STORAGE, DEFAULT_INITIAL_TASK_PROMPT)
    )
    const [slangDict, setSlangDict] = useState(() => readStorage(SLANG_DICT_STORAGE, DEFAULT_SLANG_DICT))
    const [toolPrompts, setToolPrompts] = useState<Record<string, string>>(() => {
        try {
            return JSON.parse(localStorage.getItem(TOOL_PROMPTS_STORAGE) ?? '{}') as Record<string, string>
        } catch {
            return {}
        }
    })
    const [showConfig, setShowConfig] = useState(false)
    const [selected, setSelected] = useState<{ entityType: BuffEntityType; entityName: string } | null>(null)
    const [editingKey, setEditingKey] = useState<string | null>(null)

    const existingCountMap: Record<string, number> = {}
    for (const r of rows) {
        const key = entityKey(r.entity_type, r.entity_name)
        existingCountMap[key] = (existingCountMap[key] ?? 0) + 1
    }

    function persistToolBase(value: string) {
        setToolBase(value)
        localStorage.setItem(TOOL_BASE_STORAGE, value)
    }

    function persistApiKey(value: string) {
        setApiKey(value)
        localStorage.setItem(AI_KEY_STORAGE, value)
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

    function persistToolPrompt(name: string, value: string) {
        setToolPrompts((prev) => {
            const next = { ...prev }
            if (value.trim()) next[name] = value
            else delete next[name]
            localStorage.setItem(TOOL_PROMPTS_STORAGE, JSON.stringify(next))
            return next
        })
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
        <div className="flex flex-col gap-4 lg:flex-row">
            {/* 主编辑区 */}
            <div className="min-w-0 flex-1 lg:h-[calc(100vh-8rem)]">
                {!initial ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-(--card-border) bg-(--card) p-8 text-center text-sm text-(--muted)">
                        <Icon icon="mdi:arrow-left" className="size-8" />
                        <p>从右侧选择实体开始编辑</p>
                    </div>
                ) : (
                    <BuffEntityEditor
                        key={editingKey ?? 'new'}
                        initial={initial}
                        toolBase={toolBase}
                        apiKey={apiKey}
                        systemPrompt={systemPrompt}
                        initialTaskPrompt={initialTaskPrompt}
                        toolPrompts={toolPrompts}
                        slangDict={slangDict}
                        isAdmin={isAdmin}
                        onEntityDeleted={() => {
                            setSelected(null)
                            setEditingKey(null)
                        }}
                    />
                )}
            </div>

            {/* 右侧侧栏 */}
            <div className="shrink-0 lg:order-last lg:w-72">
                {/* 连接配置按钮 */}
                <button
                    onClick={() => setShowConfig(true)}
                    className="toolbar-btn toolbar-btn-ghost mb-3 w-full justify-between"
                >
                    <span className="flex items-center gap-1.5">
                        <Icon icon="mdi:cog-outline" className="size-4" />
                        连接配置
                        {!toolBase.trim() && (
                            <span className="ml-1 rounded bg-(--warning)/15 px-1 py-0.5 text-[9px] text-(--warning)">未配置</span>
                        )}
                    </span>
                    <Icon icon="mdi:cog" className="size-4" />
                </button>

                {/* 连接配置弹窗（整个弹窗随内容滚动） */}
                {showConfig && (
                    <div className="fixed inset-0 z-50 overflow-y-auto">
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConfig(false)} />
                        <div className="relative mx-auto my-8 w-[calc(100vw-2rem)] max-w-xl rounded-xl border border-(--card-border) bg-(--card) p-4 shadow-2xl">
                            <div className="mb-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-(--fg)">连接配置</span>
                                <button onClick={() => setShowConfig(false)} className="rounded p-1 text-(--muted) hover:text-(--fg)">
                                    <Icon icon="mdi:close" className="size-5" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <label className="flex flex-col gap-1 text-xs text-(--muted)">
                                    工具箱地址
                                    <input
                                        type="url"
                                        value={toolBase}
                                        onChange={(e) => persistToolBase(e.target.value)}
                                        placeholder="http://localhost:5173"
                                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                                    />
                                    <div className="flex flex-wrap gap-1">
                                        {[
                                            { label: '本地部署', value: 'http://localhost:5173' },
                                            { label: '官方主站', value: 'https://wuwa-afyg-tool.200503.xyz' },
                                            { label: '官方副站', value: 'https://wuwa-hpyg-tool.200503.xyz' }
                                        ].map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => persistToolBase(opt.value)}
                                                className={`rounded-md px-2 py-1 text-[10px] transition-colors ${
                                                    toolBase === opt.value
                                                        ? 'bg-(--accent)/15 text-(--accent-text)'
                                                        : 'text-(--muted) hover:bg-(--card-hover) hover:text-(--fg)'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </label>
                                <label className="flex flex-col gap-1 text-xs text-(--muted)">
                                    DeepSeek API Key
                                    <input
                                        type="password"
                                        value={apiKey}
                                        onChange={(e) => persistApiKey(e.target.value)}
                                        placeholder="sk-..."
                                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                                    />
                                    <a
                                        href="https://platform.deepseek.com/api_keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] text-(--accent-text) hover:underline"
                                    >
                                        <Icon icon="mdi:open-in-new" className="size-3" />
                                        DeepSeek 开放平台（获取 API Key）
                                    </a>
                                </label>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-(--muted)">系统提示词模板</span>
                                        <button
                                            onClick={() => persistSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                                            className="text-[10px] text-(--accent-text) hover:underline"
                                        >
                                            恢复默认
                                        </button>
                                    </div>
                                    <textarea
                                        value={systemPrompt}
                                        onChange={(e) => persistSystemPrompt(e.target.value)}
                                        
                                        placeholder="支持 {ZONE_LIST} 占位符"
                                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus:border-(--accent)/60"
                                        style={{ minHeight: '200px' }}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-(--muted)">首轮任务指令</span>
                                        <button
                                            onClick={() => persistInitialTaskPrompt(DEFAULT_INITIAL_TASK_PROMPT)}
                                            className="text-[10px] text-(--accent-text) hover:underline"
                                        >
                                            恢复默认
                                        </button>
                                    </div>
                                    <textarea
                                        value={initialTaskPrompt}
                                        onChange={(e) => persistInitialTaskPrompt(e.target.value)}
                                        placeholder="支持 {ENTITY_TYPE} {ENTITY_NAME}"
                                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus:border-(--accent)/60"
                                        style={{ minHeight: '100px' }}
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-(--muted)">黑话词典（每行：原叫法=黑话；行尾可用 // 注释）</span>
                                        <button
                                            onClick={() => persistSlangDict(DEFAULT_SLANG_DICT)}
                                            className="text-[10px] text-(--accent-text) hover:underline"
                                        >
                                            恢复默认
                                        </button>
                                    </div>
                                    <textarea
                                        value={slangDict}
                                        onChange={(e) => persistSlangDict(e.target.value)}
                                        placeholder={'光合能量=回路能量 // 注释'}
                                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus:border-(--accent)/60"
                                        style={{ minHeight: '100px' }}
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-(--muted)">工具提示词（description，留空用默认）</span>
                                        <button
                                            onClick={() => {
                                                setToolPrompts({})
                                                localStorage.removeItem(TOOL_PROMPTS_STORAGE)
                                            }}
                                            className="text-[10px] text-(--accent-text) hover:underline"
                                        >
                                            全部恢复默认
                                        </button>
                                    </div>
                                    {CONFIGURABLE_TOOLS.map((name) => (
                                        <div key={name} className="flex flex-col gap-0.5">
                                            <span className="font-mono text-[10px] text-(--muted)">{name}</span>
                                            <input
                                                value={toolPrompts[name] ?? ''}
                                                onChange={(e) => persistToolPrompt(name, e.target.value)}
                                                placeholder="给 AI 的该工具用途说明（空=默认）"
                                                className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1 text-xs outline-none focus:border-(--accent)/60"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-(--muted)">
                                    提示词与词典仅存本机浏览器。可在编辑时对生成结果追问。
                                </p>
                            </div>

                            <div className="mt-3 flex justify-end border-t border-(--card-border) pt-3">
                                <button
                                    onClick={() => setShowConfig(false)}
                                    className="rounded-lg px-4 py-1.5 text-sm font-medium text-(--btn-text) transition-all hover:brightness-110"
                                    style={{ background: 'var(--btn-bg)' }}
                                >
                                    完成
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="lg:sticky lg:top-16 lg:h-[calc(100vh-8rem)]">
                    <BuffEntitySidebar
                        toolBase={toolBase}
                        existingCountMap={existingCountMap}
                        selected={selected}
                        onSelect={handleSelect}
                    />
                </div>
            </div>
        </div>
    )
}
