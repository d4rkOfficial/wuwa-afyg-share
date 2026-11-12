'use client'

// Buff 集编辑台（新系统）
// 外壳只有两件东西：① VSCode 风格的工作区标签栏（已打开的实体）② 标签页内容。
// 打开实体走弹窗（可搜索、按类型分组），不再用下拉；快照入口是标签栏右端的一个按钮，
// 页面不再有标题块 —— 编辑区占满顶栏以下的全部面积。
//
// 保留的关键行为：**切实体不丢草稿** —— 每个打开过的实体都固定挂载一个编辑器实例，
// 未激活的只隐藏不卸载，所以切回来时未保存的改动原样都在。
import type { ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import BuffEntityEditor from '@/components/admin/buff-entity-editor'
import BuffEntityPicker from './buff-entity-picker'
import { WkButton, WkConfirm, wkToast } from '@/design'
import type { EntityIconMaps } from '@/lib/data/avatar-icons'
import type { BuffEntityType, BuffFolderRow, BuffSetRow } from '@/lib/types/db'

interface Entity {
    key: string
    entityType: BuffEntityType
    entityName: string
}

const keyOf = (entityType: string, entityName: string) => `${entityType}/${entityName}`

export default function BuffEditor({
    rows,
    folders,
    isAdmin,
    buffLocks,
    entityIcons,
    title,
    action
}: {
    rows: BuffSetRow[]
    folders: BuffFolderRow[]
    isAdmin: boolean
    buffLocks: Record<string, boolean>
    /** 实体头像表：打开实体弹窗里每行左侧的图标（拿不到时降级成通用图标） */
    entityIcons?: EntityIconMaps
    /** 顶部标题栏的文字 */
    title: string
    /** 标题栏右端的动作（快照面板）；没打开实体时它会被放进占位卡片里 */
    action?: ReactNode
}) {
    const router = useRouter()
    const [opened, setOpened] = useState<Entity[]>([])
    const [activeKey, setActiveKey] = useState<string | null>(null)
    const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({})
    const [pickerOpen, setPickerOpen] = useState(false)
    const [closing, setClosing] = useState<Entity | null>(null)

    const entities = useMemo<Entity[]>(() => {
        const map = new Map<string, Entity>()
        for (const row of rows) {
            const key = keyOf(row.entity_type, row.entity_name)
            if (!map.has(key)) map.set(key, { key, entityType: row.entity_type, entityName: row.entity_name })
        }
        for (const folder of folders) {
            const key = keyOf(folder.entity_type, folder.entity_name)
            if (!map.has(key)) map.set(key, { key, entityType: folder.entity_type, entityName: folder.entity_name })
        }
        return [...map.values()].sort((a, b) => {
            if (a.entityType !== b.entityType) return a.entityType.localeCompare(b.entityType)
            return a.entityName.localeCompare(b.entityName, 'zh-Hans-CN')
        })
    }, [rows, folders])

    const countMap = useMemo(() => {
        const map: Record<string, number> = {}
        for (const row of rows) {
            const key = keyOf(row.entity_type, row.entity_name)
            map[key] = (map[key] ?? 0) + 1
        }
        return map
    }, [rows])

    const openEntity = useCallback(
        (key: string) => {
            const entity = entities.find((item) => item.key === key)
            if (!entity) return
            if (!isAdmin && buffLocks[key]) {
                wkToast(`「${entity.entityName}」已被管理员锁定，仅管理员可编辑`, 'error')
                return
            }
            setOpened((prev) => (prev.some((item) => item.key === key) ? prev : [...prev, entity]))
            setActiveKey(key)
        },
        [entities, buffLocks, isAdmin]
    )

    const close = useCallback((entity: Entity) => {
        setOpened((prev) => {
            const index = prev.findIndex((item) => item.key === entity.key)
            const next = prev.filter((item) => item.key !== entity.key)
            setActiveKey((current) => {
                if (current !== entity.key) return current
                const neighbour = next[index] ?? next[index - 1] ?? null
                return neighbour ? neighbour.key : null
            })
            return next
        })
    }, [])

    const dirtyCount = Object.values(dirtyMap).filter(Boolean).length

    if (opened.length === 0) {
        return (
            <>
                {/* 没打开实体：占位卡片几乎撑满整屏，只留一点边距；标题与快照入口都放进这张卡片里 */}
                <div className="wk-workbench-empty">
                    <div className="wk-workbench-empty-head">
                        <span className="wk-workbench-title">{title}</span>
                        {action && <span className="wk-spacer" />}
                        {action}
                    </div>
                    <div className="wk-workbench-empty-body">
                        <p style={{ fontSize: 'var(--wk-t-lead)' }}>还没有打开实体</p>
                        <p className="wk-meta" style={{ maxWidth: 460 }}>
                            搜索并选择一个实体开始编辑；标签页之间切换不会丢未保存的改动。
                        </p>
                        <WkButton
                            variant="primary"
                            size="md"
                            onClick={() => setPickerOpen(true)}
                            leading={<Icon icon="mdi:folder-search-outline" className="wk-nav-icon" aria-hidden="true" />}
                        >
                            打开实体
                        </WkButton>
                    </div>
                </div>
                <BuffEntityPicker
                    open={pickerOpen}
                    entities={entities}
                    counts={countMap}
                    locks={buffLocks}
                    icons={entityIcons}
                    onPick={openEntity}
                    onClose={() => setPickerOpen(false)}
                />
            </>
        )
    }

    return (
        <>
            <div className="wk-workbench-head">
                <span className="wk-workbench-title">{title}</span>
                {action && <span className="wk-spacer" />}
                {action}
            </div>
            <div className="wk-tabs-card">
                <div className="wk-tabs" role="tablist" aria-label="已打开的实体">
                    {opened.map((entity) => {
                        const active = entity.key === activeKey
                        const dirty = !!dirtyMap[entity.key]
                        const locked = !!buffLocks[entity.key]
                        return (
                            <div
                                key={entity.key}
                                className="wk-tab"
                                data-active={active}
                                data-dirty={dirty}
                                data-locked={locked}
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    className="wk-tab-name"
                                    onClick={() => setActiveKey(entity.key)}
                                    title={locked ? `${entity.entityName}（已被管理员锁定）` : entity.entityName}
                                >
                                    {entity.entityName}
                                </button>
                                {/* 锁定的实体在标签上就能看出来，不用切页 */}
                                {locked && (
                                    <Icon
                                        icon="mdi:lock-outline"
                                        width={11}
                                        height={11}
                                        className="wk-tab-lock"
                                        aria-label="仅管理员可编辑"
                                    />
                                )}
                                {dirty && <span className="wk-tab-dirty" aria-label="有未保存改动" />}
                                <button
                                    type="button"
                                    className="wk-tab-close"
                                    aria-label={`关闭 ${entity.entityName}`}
                                    title={dirty ? '有未保存改动，关闭前会确认' : '关闭'}
                                    onClick={() => (dirty ? setClosing(entity) : close(entity))}
                                >
                                    <Icon icon="mdi:close" width={12} height={12} />
                                </button>
                            </div>
                        )
                    })}
                    <button
                        type="button"
                        className="wk-tab-add"
                        aria-label="打开实体"
                        title="打开实体"
                        onClick={() => setPickerOpen(true)}
                    >
                        <Icon icon="mdi:plus" width={14} height={14} />
                    </button>
                    {dirtyCount > 0 && <span className="wk-tabs-note">未保存 {dirtyCount}</span>}
                </div>

                <div className="wk-tabs-body">
                    {opened.map((entity) => (
                        <div
                            key={entity.key}
                            style={{
                                display: entity.key === activeKey ? 'flex' : 'none',
                                flexDirection: 'column',
                                flex: 1,
                                minWidth: 0,
                                minHeight: 0
                            }}
                            aria-hidden={entity.key !== activeKey}
                        >
                            <BuffEntityEditor
                                initial={{
                                    entityType: entity.entityType,
                                    entityName: entity.entityName,
                                    buffs: rows.filter(
                                        (row) =>
                                            row.entity_type === entity.entityType &&
                                            row.entity_name === entity.entityName
                                    ),
                                    folders: folders.filter(
                                        (folder) =>
                                            folder.entity_type === entity.entityType &&
                                            folder.entity_name === entity.entityName
                                    )
                                }}
                                isAdmin={isAdmin}
                                canEdit={isAdmin || !buffLocks[entity.key]}
                                locked={!!buffLocks[entity.key]}
                                onDirtyChange={(dirty) =>
                                    setDirtyMap((prev) =>
                                        prev[entity.key] === dirty ? prev : { ...prev, [entity.key]: dirty }
                                    )
                                }
                                onSaved={(count) => wkToast(`已保存 ${entity.entityName}：${count} 条 Buff`, 'ok')}
                                onEntityDeleted={() => {
                                    wkToast(`已删除实体 ${entity.entityName}`, 'ok')
                                    close(entity)
                                    router.refresh()
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <BuffEntityPicker
                open={pickerOpen}
                entities={entities}
                counts={countMap}
                locks={buffLocks}
                icons={entityIcons}
                onPick={openEntity}
                onClose={() => setPickerOpen(false)}
            />

            <WkConfirm
                open={!!closing}
                onClose={() => setClosing(null)}
                title={`关闭「${closing?.entityName ?? ''}」？`}
                description="这个实体有未保存的改动，关闭后会丢失。"
                confirmLabel="放弃并关闭"
                onConfirm={() => {
                    if (closing) close(closing)
                    setClosing(null)
                }}
            />
        </>
    )
}
