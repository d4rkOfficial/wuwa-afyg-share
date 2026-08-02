'use client'

import { useState } from 'react'
import { Icon } from '@iconify/react'
import BuffEntitySidebar from '@/components/admin/buff-entity-sidebar'
import BuffEntityEditor from '@/components/admin/buff-entity-editor'
import { DEFAULT_SYSTEM_PROMPT, DEFAULT_USER_PROMPT_TEMPLATE, DEFAULT_SLANG_DICT } from '@/lib/ai/prompts'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

interface Props {
    rows: BuffSetRow[]
}

const AI_KEY_STORAGE = 'wuwa-afyg:deepseek-api-key'
const TOOL_BASE_STORAGE = 'wuwa-afyg:tool-base'
const SYSTEM_PROMPT_STORAGE = 'wuwa-afyg:deepseek-system-prompt'
const USER_PROMPT_STORAGE = 'wuwa-afyg:deepseek-user-prompt'
const SLANG_DICT_STORAGE = 'wuwa-afyg:deepseek-slang-dict'
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

export default function BuffSetsAdmin({ rows }: Props) {
    const [toolBase, setToolBase] = useState(() => readStorage(TOOL_BASE_STORAGE, TOOL_BASE_DEFAULT))
    const [apiKey, setApiKey] = useState(() => readStorage(AI_KEY_STORAGE))
    const [systemPrompt, setSystemPrompt] = useState(() =>
        readStorage(SYSTEM_PROMPT_STORAGE, DEFAULT_SYSTEM_PROMPT)
    )
    const [userPromptTemplate, setUserPromptTemplate] = useState(() =>
        readStorage(USER_PROMPT_STORAGE, DEFAULT_USER_PROMPT_TEMPLATE)
    )
    const [slangDict, setSlangDict] = useState(() => readStorage(SLANG_DICT_STORAGE, DEFAULT_SLANG_DICT))
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

    function persistUserPromptTemplate(value: string) {
        setUserPromptTemplate(value)
        localStorage.setItem(USER_PROMPT_STORAGE, value)
    }

    function persistSlangDict(value: string) {
        setSlangDict(value)
        localStorage.setItem(SLANG_DICT_STORAGE, value)
    }

    function handleSelect(entity: { entityType: BuffEntityType; entityName: string }) {
        setSelected(entity)
        setEditingKey(entityKey(entity.entityType, entity.entityName))
    }

    function handleNew() {
        setSelected(null)
        setEditingKey(null)
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
            <div className="min-w-0 flex-1">
                {!initial && (
                    <div className="mb-3 rounded-xl border border-(--card-border) bg-(--card) p-4 text-center text-sm text-(--muted)">
                        <Icon icon="mdi:arrow-left" className="mr-1 inline size-4" />
                        从右侧选择实体开始编辑，或点击「新增实体」
                    </div>
                )}
                <BuffEntityEditor
                    key={editingKey ?? 'new'}
                    initial={initial}
                    toolBase={toolBase}
                    apiKey={apiKey}
                    systemPrompt={systemPrompt}
                    userPromptTemplate={userPromptTemplate}
                    slangDict={slangDict}
                    onEntityDeleted={() => {
                        setSelected(null)
                        setEditingKey(null)
                    }}
                />
            </div>

            {/* 右侧侧栏 */}
            <div className="shrink-0 lg:order-last lg:w-72">
                {/* 配置折叠面板 */}
                <details className="mb-3 rounded-xl border border-(--card-border) bg-(--card) p-3" open={showConfig}>
                    <summary
                        onClick={(e) => {
                            e.preventDefault()
                            setShowConfig((v) => !v)
                        }}
                        className="flex cursor-pointer select-none items-center justify-between text-left text-xs font-medium text-(--muted)"
                    >
                        <span className="flex items-center gap-1.5">
                            <Icon icon="mdi:cog-outline" className="size-4" />
                            连接配置
                        </span>
                        <Icon icon={showConfig ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="size-4" />
                    </summary>
                    {showConfig && (
                        <div className="mt-3 space-y-2">
                            <label className="flex flex-col gap-1 text-xs text-(--muted)">
                                工具箱地址
                                <input
                                    type="url"
                                    value={toolBase}
                                    onChange={(e) => persistToolBase(e.target.value)}
                                    placeholder="http://localhost:5173"
                                    className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                                />
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
                                    rows={10}
                                    placeholder="支持 {ZONE_LIST} 占位符"
                                    className="w-full resize-y rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus:border-(--accent)/60"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-(--muted)">用户消息模板</span>
                                    <button
                                        onClick={() => persistUserPromptTemplate(DEFAULT_USER_PROMPT_TEMPLATE)}
                                        className="text-[10px] text-(--accent-text) hover:underline"
                                    >
                                        恢复默认
                                    </button>
                                </div>
                                <textarea
                                    value={userPromptTemplate}
                                    onChange={(e) => persistUserPromptTemplate(e.target.value)}
                                    rows={6}
                                    placeholder="支持 {ENTITY_TYPE} {ENTITY_NAME} {INFO}"
                                    className="w-full resize-y rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus:border-(--accent)/60"
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
                                    rows={5}
                                    placeholder={'光合能量=回路能量 // 注释'}
                                    className="w-full resize-y rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 font-mono text-[11px] leading-relaxed outline-none focus:border-(--accent)/60"
                                />
                            </div>
                            <p className="text-[10px] text-(--muted)">
                                提示词与词典仅存本机浏览器。可在编辑时对生成结果追问。
                            </p>
                        </div>
                    )}
                </details>

                <div className="lg:h-[calc(100vh-16rem)]">
                    <BuffEntitySidebar
                        toolBase={toolBase}
                        existingCountMap={existingCountMap}
                        selected={selected}
                        onSelect={handleSelect}
                        onNew={handleNew}
                    />
                </div>
            </div>
        </div>
    )
}
