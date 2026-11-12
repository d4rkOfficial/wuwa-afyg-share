'use client'

// 标准词条集编辑台（新系统）：整页占满顶栏以下，只有内部滚动。
// 外壳 = VSCode 风格标签栏（已打开的角色）+ 每个角色的编辑台。
// 角色**从列表里添加**（弹窗可搜索），不再手输角色名；每个角色一个标签页，切换不丢草稿。
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import SubstatCharacterEditor from './substat-character-editor'
import { WkButton, WkConfirm, WkDialog, WkInput, wkToast } from '@/design'
import { fetchEntityList } from '@/lib/upstream'
import type { StandardSubstatSetRow } from '@/lib/types/db'

export default function SubstatEditor({
    rows,
    isAdmin,
    substatLocks,
    characterIcons = {},
    title
}: {
    rows: StandardSubstatSetRow[]
    isAdmin: boolean
    substatLocks: Record<string, boolean>
    /** @desc 角色头像（弹窗列表左侧图标；拿不到时降级成通用圆点） */
    characterIcons?: Record<string, string>
    /** @desc 顶部标题栏文字 */
    title: string
}) {
    const router = useRouter()
    const [opened, setOpened] = useState<string[]>([])
    const [activeKey, setActiveKey] = useState<string | null>(null)
    const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({})
    const [pickerOpen, setPickerOpen] = useState(false)
    const [pickerSearch, setPickerSearch] = useState('')
    const [closing, setClosing] = useState<string | null>(null)
    const [catalog, setCatalog] = useState<string[]>([])
    const [catalogError, setCatalogError] = useState<string | null>(null)

    // 角色目录直连上游（新角色不用改代码）；拿不到时仍可从「已有方案」里打开
    useEffect(() => {
        let alive = true
        fetchEntityList('character')
            .then((list) => {
                if (!alive) return
                const names = [
                    ...new Set(list.map((entry) => entry.name?.trim()).filter((value): value is string => !!value))
                ]
                setCatalog(names)
            })
            .catch((error) => {
                if (!alive) return
                setCatalogError(`角色目录拉取失败：${error instanceof Error ? error.message : '未知错误'}`)
            })
        return () => {
            alive = false
        }
    }, [])

    const rowMap = useMemo(() => new Map(rows.map((row) => [row.character_name, row])), [rows])

    const characters = useMemo(() => {
        const names = new Set<string>(catalog)
        for (const row of rows) names.add(row.character_name)
        return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
    }, [catalog, rows])

    const filtered = useMemo(() => {
        const keyword = pickerSearch.trim()
        if (!keyword) return characters
        return characters.filter((name) => name.includes(keyword))
    }, [characters, pickerSearch])

    const openCharacter = useCallback(
        (name: string) => {
            if (!isAdmin && substatLocks[name]) {
                wkToast(`「${name}」已被管理员锁定，仅管理员可编辑`, 'error')
                return
            }
            setOpened((prev) => (prev.includes(name) ? prev : [...prev, name]))
            setActiveKey(name)
            setPickerOpen(false)
            setPickerSearch('')
        },
        [isAdmin, substatLocks]
    )

    const close = useCallback((name: string) => {
        setOpened((prev) => {
            const index = prev.indexOf(name)
            const next = prev.filter((item) => item !== name)
            setActiveKey((current) => {
                if (current !== name) return current
                return next[index] ?? next[index - 1] ?? null
            })
            return next
        })
    }, [])

    const dirtyCount = Object.values(dirtyMap).filter(Boolean).length

    const picker = (
        <WkDialog
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            title="添加角色"
            width={520}
            footer={
                <WkButton variant="quiet" onClick={() => setPickerOpen(false)}>
                    关闭
                </WkButton>
            }
        >
            <div style={{ display: 'grid', gap: 10 }}>
                <WkInput
                    value={pickerSearch}
                    onChange={(event) => setPickerSearch(event.target.value)}
                    placeholder="搜索角色名"
                    aria-label="搜索角色"
                />
                {catalogError && <p className="wk-meta">{catalogError}</p>}
                <div className="wk-char-picker-list">
                    {filtered.length === 0 ? (
                        <p className="wk-meta" style={{ padding: '12px 6px' }}>
                            没有匹配的角色
                        </p>
                    ) : (
                        filtered.map((name) => {
                            const saved = rowMap.has(name)
                            const locked = !!substatLocks[name]
                            const icon = characterIcons[name]
                            const already = opened.includes(name)
                            return (
                                <button
                                    key={name}
                                    type="button"
                                    className="wk-char-picker-item"
                                    data-active={name === activeKey}
                                    onClick={() => openCharacter(name)}
                                >
                                    <span className="wk-pcard-avatar" style={{ width: 24, height: 24, flexShrink: 0 }}>
                                        {icon ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={icon} alt="" loading="lazy" />
                                        ) : null}
                                    </span>
                                    <span className="wk-char-picker-name">{name}</span>
                                    {saved && (
                                        <span className="wk-badge wk-badge--ok">{locked ? '已保存 · 已锁定' : '已保存'}</span>
                                    )}
                                    {!saved && <span className="wk-meta">未保存</span>}
                                    {already && <span className="wk-meta">已打开</span>}
                                </button>
                            )
                        })
                    )}
                </div>
            </div>
        </WkDialog>
    )

    if (opened.length === 0) {
        return (
            <>
                <div className="wk-workbench-empty">
                    <div className="wk-workbench-empty-head">
                        <span className="wk-workbench-title">{title}</span>
                    </div>
                    <div className="wk-workbench-empty-body">
                        <p style={{ fontSize: 'var(--wk-t-lead)' }}>还没有打开角色</p>
                        <p className="wk-meta" style={{ maxWidth: 460 }}>
                            从角色列表里添加要编辑的对象，一个角色一个标签页；左侧列出五个声骸部位，点哪个改哪个。
                        </p>
                        <WkButton
                            variant="primary"
                            size="md"
                            onClick={() => setPickerOpen(true)}
                            leading={<Icon icon="mdi:account-search-outline" className="wk-nav-icon" aria-hidden="true" />}
                        >
                            添加角色
                        </WkButton>
                    </div>
                </div>
                {picker}
            </>
        )
    }

    return (
        <>
            <div className="wk-workbench-head">
                <span className="wk-workbench-title">{title}</span>
            </div>
            <div className="wk-tabs-card">
                <div className="wk-tabs" role="tablist" aria-label="已打开的角色">
                    {opened.map((name) => {
                        const active = name === activeKey
                        const dirty = !!dirtyMap[name]
                        const locked = !!substatLocks[name]
                        return (
                            <div key={name} className="wk-tab" data-active={active} data-dirty={dirty} data-locked={locked}>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    className="wk-tab-name"
                                    onClick={() => setActiveKey(name)}
                                    title={locked ? `${name}（已被管理员锁定）` : name}
                                >
                                    {name}
                                </button>
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
                                    aria-label={`关闭 ${name}`}
                                    title={dirty ? '有未保存改动，关闭前会确认' : '关闭'}
                                    onClick={() => (dirty ? setClosing(name) : close(name))}
                                >
                                    <Icon icon="mdi:close" width={12} height={12} />
                                </button>
                            </div>
                        )
                    })}
                    <button
                        type="button"
                        className="wk-tab-add"
                        aria-label="添加角色"
                        title="添加角色"
                        onClick={() => setPickerOpen(true)}
                    >
                        <Icon icon="mdi:plus" width={14} height={14} />
                    </button>
                    {dirtyCount > 0 && <span className="wk-tabs-note">未保存 {dirtyCount}</span>}
                </div>

                <div className="wk-tabs-body">
                    {opened.map((name) => (
                        <div
                            key={name}
                            style={{
                                display: name === activeKey ? 'flex' : 'none',
                                flexDirection: 'column',
                                flex: 1,
                                minWidth: 0,
                                minHeight: 0
                            }}
                            aria-hidden={name !== activeKey}
                        >
                            <SubstatCharacterEditor
                                characterName={name}
                                initialRow={rowMap.get(name)}
                                isAdmin={isAdmin}
                                locked={!!substatLocks[name]}
                                onDirtyChange={(dirty) =>
                                    setDirtyMap((prev) => (prev[name] === dirty ? prev : { ...prev, [name]: dirty }))
                                }
                                onDeleted={() => {
                                    close(name)
                                    router.refresh()
                                }}
                            />
                        </div>
                    ))}
                </div>
            </div>

            {picker}

            <WkConfirm
                open={!!closing}
                onClose={() => setClosing(null)}
                title={`关闭「${closing ?? ''}」？`}
                description="这个角色有未保存的改动，关闭后会丢失。"
                confirmLabel="放弃并关闭"
                onConfirm={() => {
                    if (closing) close(closing)
                    setClosing(null)
                }}
            />
        </>
    )
}
