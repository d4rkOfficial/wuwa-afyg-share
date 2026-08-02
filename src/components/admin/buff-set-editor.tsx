'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { upsertBuffSet, deleteBuffPreset } from '@/lib/actions/buff-sets'
import { BUFF_ENTITY_TYPES, BUFF_ENTITY_LABELS, BUFF_ZONES, BUFF_ZONE_MAP } from '@/lib/consts/buff-zones'
import type { BuffEntityType, BuffSetRow } from '@/lib/types/db'

interface Props {
    initial: BuffSetRow | null
}

interface ZoneRow {
    zoneId: string
    value: string
    override: boolean
}

export default function BuffSetEditor({ initial }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [flash, setFlash] = useState<string | null>(null)

    const isEdit = initial !== null
    const [entityType, setEntityType] = useState<BuffEntityType>(initial?.entity_type ?? 'character')
    const [entityName, setEntityName] = useState(initial?.entity_name ?? '')
    const [buffName, setBuffName] = useState(initial?.buff_name ?? '')
    const [zones, setZones] = useState<ZoneRow[]>(
        (initial?.buff_set ?? []).map((z) => ({
            zoneId: z.zoneId,
            value: String(z.value),
            override: !!z.override
        }))
    )

    const zoneIds = new Set(zones.map((z) => z.zoneId))

    function run(fn: () => Promise<unknown>) {
        startTransition(async () => {
            const res = await fn()
            const r = res as { error?: string } | undefined
            if (r?.error) setFlash(r.error)
            else {
                setFlash(null)
                router.refresh()
            }
        })
    }

    function setZone(zoneId: string, patch: Partial<ZoneRow>) {
        setZones((prev) => prev.map((z) => (z.zoneId === zoneId ? { ...z, ...patch } : z)))
    }

    function toggleAddZone(zoneId: string) {
        setZones((prev) => {
            if (prev.some((z) => z.zoneId === zoneId)) return prev.filter((z) => z.zoneId !== zoneId)
            return [...prev, { zoneId, value: '', override: false }]
        })
    }

    function onSave() {
        const name = entityName.trim()
        const buffer = buffName.trim()
        if (!name || !buffer) {
            setFlash('实体名与增益名不能为空')
            return
        }
        const payload: { zoneId: string; value: number; override?: boolean }[] = zones
            .map((z) => {
                const n = Number(z.value)
                if (!z.zoneId || Number.isNaN(n)) return null
                return { zoneId: z.zoneId, value: n, ...(z.override ? { override: true } : {}) }
            })
            .filter((z): z is { zoneId: string; value: number; override?: boolean } => z !== null)
        run(() => upsertBuffSet({ entityType, entityName: name, buffName: buffer, zones: payload }))
    }

    function onDelete() {
        if (!initial) return
        run(() => deleteBuffPreset(initial.entity_type, initial.entity_name, initial.buff_name))
    }

    return (
        <div className="rounded-xl border border-(--card-border) bg-(--card) p-4">
            {flash && (
                <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{flash}</div>
            )}

            {/* 实体信息头 */}
            <div className="mb-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-(--muted)">
                    实体类型
                    <select
                        value={entityType}
                        onChange={(e) => setEntityType(e.target.value as BuffEntityType)}
                        disabled={isEdit}
                        className="rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60 disabled:opacity-50"
                    >
                        {BUFF_ENTITY_TYPES.map((t) => (
                            <option key={t} value={t}>
                                {BUFF_ENTITY_LABELS[t]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-(--muted)">
                    实体名（角色/武器/声骸/套装名）
                    <input
                        value={entityName}
                        onChange={(e) => setEntityName(e.target.value)}
                        maxLength={60}
                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                    />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs text-(--muted)">
                    增益名（Buff 名）
                    <input
                        value={buffName}
                        onChange={(e) => setBuffName(e.target.value)}
                        maxLength={80}
                        className="w-full rounded-lg border border-(--card-border) bg-(--input-bg) px-2 py-1.5 text-sm outline-none focus:border-(--accent)/60"
                    />
                </label>
            </div>

            {/* 主体：左乘区选择，右数值编辑（仿 afyg-tool BUFF 弹窗） */}
            <div className="flex flex-col gap-4 md:flex-row">
                {/* 乘区白名单可点选 */}
                <div className="md:w-44 shrink-0">
                    <div className="mb-1 text-xs text-(--muted)">乘区（点击添加/移除）</div>
                    <div className="grid grid-cols-2 gap-1 md:grid-cols-1">
                        {BUFF_ZONES.map((def) => {
                            const exists = zoneIds.has(def.id)
                            return (
                                <button
                                    key={def.id}
                                    onClick={() => toggleAddZone(def.id)}
                                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-left transition-colors ${
                                        exists
                                            ? 'bg-(--accent)/15 text-(--accent-text)'
                                            : 'text-(--muted) hover:bg-(--card-hover)'
                                    }`}
                                >
                                    <Icon
                                        icon={exists ? 'mdi:check' : 'mdi:circle-outline'}
                                        className="size-3.5 shrink-0"
                                    />
                                    {def.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* 已选乘区数值编辑 */}
                <div className="flex-1 space-y-1.5">
                    {zones.length === 0 ? (
                        <div className="py-6 text-center text-xs text-(--muted)">暂无乘区，请在左侧点击添加</div>
                    ) : (
                        zones.map((z) => {
                            const def = BUFF_ZONE_MAP.get(z.zoneId)
                            return (
                                <div
                                    key={z.zoneId}
                                    className="flex items-center gap-2 rounded-lg bg-(--card-hover) px-3 py-2"
                                >
                                    <span className="min-w-0 flex-1 truncate text-xs">{def?.label ?? z.zoneId}</span>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <input
                                            type="number"
                                            value={z.value}
                                            onChange={(e) => setZone(z.zoneId, { value: e.target.value })}
                                            className="w-16 rounded border border-(--card-border) bg-(--input-bg) px-1.5 py-1 text-xs text-right outline-none focus:border-(--accent)/60 tabular-nums"
                                        />
                                        <span className="w-3 text-[10px] text-(--muted)">
                                            {def?.unit === '%' ? '%' : ''}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setZone(z.zoneId, { override: !z.override })}
                                        className={`shrink-0 rounded border px-1.5 py-1 text-[10px] transition-colors ${
                                            z.override
                                                ? 'border-(--accent) text-(--accent-text)'
                                                : 'border-transparent text-(--muted) hover:text-(--fg)'
                                        }`}
                                        title="覆盖/追加"
                                    >
                                        {z.override ? '覆盖' : '追加'}
                                    </button>
                                    <button
                                        onClick={() => toggleAddZone(z.zoneId)}
                                        className="shrink-0 rounded p-1 text-(--muted) transition-colors hover:text-red-400"
                                        title="移除"
                                    >
                                        <Icon icon="mdi:close" className="size-3.5" />
                                    </button>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* 操作 */}
            <div className="mt-4 flex items-center justify-end gap-2 border-t border-(--card-border) pt-3">
                {isEdit && (
                    <>
                        {confirmDelete ? (
                            <button
                                onClick={onDelete}
                                disabled={pending}
                                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white hover:brightness-110 disabled:opacity-50"
                            >
                                确认删除
                            </button>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                onBlur={() => setTimeout(() => setConfirmDelete(false), 2000)}
                                className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/20"
                            >
                                <Icon icon="mdi:trash-can-outline" className="size-3.5" />
                                删除
                            </button>
                        )}
                    </>
                )}
                <button
                    onClick={onSave}
                    disabled={pending}
                    className="rounded-lg px-4 py-1.5 text-sm font-medium text-(--btn-text) disabled:opacity-50"
                    style={{ background: 'var(--btn-bg)' }}
                >
                    <Icon icon="mdi:check" className="mr-1 inline size-4" />
                    保存{isEdit ? '修改' : '新增'}
                </button>
            </div>
        </div>
    )
}