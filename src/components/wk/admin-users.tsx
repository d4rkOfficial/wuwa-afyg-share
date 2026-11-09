'use client'

// 管理员管理（新系统）
// 权限是「谁授给谁」的从属关系，所以用**从上到下的树**而不是平铺列表：
// 缩进 + 一条竖直导线表达层级，同级再多也只是往下排，不会横向撑爆（这是列表 / 组织图做不到的）。
// 一对多的两种极端都有兜底：单节点超过 CHILD_WINDOW 个下级时折叠成「展开其余 N 位」；
// 行内元素（用户名、徽标、撤销按钮）全部可换行，窄屏只是变高，不会溢出。
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@iconify/react'
import { WkBadge, WkButton, WkConfirm, WkEmpty, WkField, WkInput, wkToast } from '@/design'
import { adminGrantAdmin, adminRevokeAdmin } from '@/lib/actions/admin-users'
import { isImeComposing } from '@/lib/keyboard'

export interface AdminViewItem {
    id: string
    username: string
    grantedBy: string | null
    grantedByMe: boolean
}

interface TreeNode {
    item: AdminViewItem
    children: TreeNode[]
    /** 上级不在管理员列表里（比如上级已被撤权），只能挂到顶层并标注 */
    orphan: boolean
}

/** 一个节点默认最多直接铺 6 个下级，超出的收进「展开其余 N 位」 */
const CHILD_WINDOW = 6

/**
 * @desc 把扁平的「谁授给谁」列表还原成森林。
 *  - `grantedBy` 是用户名，所以先按名字找上级；找不到（上级已不是管理员）就挂顶层并标 orphan；
 *  - 同名上级取第一个，避免数据里出现同名时把节点挂到两处；
 *  - 用「向上追溯」判环：真出现 A→B→A 这种脏数据时，后来者降级为顶层，渲染不会无限递归。
 */
function buildForest(admins: AdminViewItem[]): { roots: TreeNode[]; maxDepth: number } {
    const nodes = new Map<string, TreeNode>()
    for (const item of admins) nodes.set(item.id, { item, children: [], orphan: false })

    const sorted = [...admins].sort((a, b) => a.username.localeCompare(b.username, 'zh-Hans-CN'))
    const byName = new Map<string, AdminViewItem[]>()
    for (const item of sorted) {
        const list = byName.get(item.username) ?? []
        list.push(item)
        byName.set(item.username, list)
    }

    const parentOf = new Map<string, string>()
    const roots: TreeNode[] = []

    for (const item of sorted) {
        const node = nodes.get(item.id)
        if (!node) continue
        const parentName = item.grantedBy
        if (!parentName) {
            roots.push(node)
            continue
        }
        const candidates = (byName.get(parentName) ?? []).filter((candidate) => candidate.id !== item.id)
        const parent = candidates[0]
        if (!parent) {
            node.orphan = true
            roots.push(node)
            continue
        }
        // 判环：从 parent 往上走，若能回到自己就说明这条边会成环
        let cursor: string | undefined = parent.id
        const seen = new Set<string>()
        let cyclic = false
        while (cursor) {
            if (cursor === item.id) {
                cyclic = true
                break
            }
            if (seen.has(cursor)) break
            seen.add(cursor)
            cursor = parentOf.get(cursor)
        }
        if (cyclic) {
            node.orphan = true
            roots.push(node)
            continue
        }
        parentOf.set(item.id, parent.id)
        nodes.get(parent.id)?.children.push(node)
    }

    let maxDepth = 0
    const walk = (node: TreeNode, depth: number) => {
        maxDepth = Math.max(maxDepth, depth)
        for (const child of node.children) walk(child, depth + 1)
    }
    for (const root of roots) walk(root, 1)

    return { roots, maxDepth }
}

function NodeRow({
    node,
    childCount,
    pending,
    onRevoke
}: {
    node: TreeNode
    childCount: number
    pending: boolean
    onRevoke: (item: AdminViewItem) => void
}) {
    const { item, orphan } = node
    return (
        <span className="wk-tree-row">
            <span className="wk-tree-name" title={item.username}>
                {item.username}
            </span>
            {item.grantedBy === null ? (
                <WkBadge tone="accent">根管理员</WkBadge>
            ) : orphan ? (
                <WkBadge tone="warn" >
                    上级 {item.grantedBy} 已不在列表
                </WkBadge>
            ) : (
                <WkBadge>由 {item.grantedBy} 授权</WkBadge>
            )}
            {item.grantedByMe && <WkBadge tone="ok">我授权的</WkBadge>}
            {childCount > 0 && <span className="wk-tree-count">下辖 {childCount} 位</span>}
            {item.grantedBy === null && <span className="wk-tree-note">不可通过本页撤销</span>}
            {item.grantedByMe && (
                <span className="wk-tree-action">
                    <WkButton
                        size="sm"
                        variant="danger"
                        disabled={pending}
                        title="他授出的权限会一并收回（连坐）"
                        onClick={() => onRevoke(item)}
                    >
                        撤销
                    </WkButton>
                </span>
            )}
        </span>
    )
}

function TreeNodeView({
    node,
    pending,
    onRevoke
}: {
    node: TreeNode
    pending: boolean
    onRevoke: (item: AdminViewItem) => void
}) {
    const children = node.children
    if (children.length === 0) {
        return (
            <div className="wk-tree-node">
                <NodeRow node={node} childCount={0} pending={pending} onRevoke={onRevoke} />
            </div>
        )
    }

    const head = children.slice(0, CHILD_WINDOW)
    const rest = children.slice(CHILD_WINDOW)

    return (
        <details className="wk-tree-node wk-tree-branch" open>
            <summary>
                <Icon icon="mdi:chevron-right" className="wk-tree-chevron wk-nav-icon" aria-hidden="true" />
                <NodeRow node={node} childCount={children.length} pending={pending} onRevoke={onRevoke} />
            </summary>
            <div className="wk-tree-children">
                {head.map((child) => (
                    <TreeNodeView key={child.item.id} node={child} pending={pending} onRevoke={onRevoke} />
                ))}
                {rest.length > 0 && (
                    <details className="wk-tree-more">
                        <summary>展开其余 {rest.length} 位下级</summary>
                        {rest.map((child) => (
                            <TreeNodeView key={child.item.id} node={child} pending={pending} onRevoke={onRevoke} />
                        ))}
                    </details>
                )}
            </div>
        </details>
    )
}

export default function AdminUsers({ admins }: { admins: AdminViewItem[] }) {
    const router = useRouter()
    const [username, setUsername] = useState('')
    const [pending, startTransition] = useTransition()
    const [revoking, setRevoking] = useState<AdminViewItem | null>(null)

    const { roots, maxDepth } = useMemo(() => buildForest(admins), [admins])

    function grant() {
        const name = username.trim()
        if (!name) return
        startTransition(async () => {
            const result = await adminGrantAdmin(name)
            if (result?.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(result?.data?.message ?? '已授权', 'ok')
            setUsername('')
            router.refresh()
        })
    }

    function revoke(item: AdminViewItem) {
        startTransition(async () => {
            const result = await adminRevokeAdmin(item.username)
            if (result?.error) {
                wkToast(result.error, 'error')
                return
            }
            wkToast(result?.data?.message ?? '已撤销', 'ok')
            setRevoking(null)
            router.refresh()
        })
    }

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <div className="wk-card wk-card-pad" style={{ display: 'grid', gap: 12 }}>
                <div className="wk-label">授权管理员</div>
                <div className="wk-toolbar">
                    <WkField className="wk-spacer">
                        <WkInput
                            value={username}
                            onChange={(event) => setUsername(event.target.value)}
                            onKeyDown={(event) => {
                            if (isImeComposing(event)) return
                            if (event.key === 'Enter') grant()
                        }}
                            placeholder="输入用户名"
                            aria-label="要授权的用户名"
                        />
                    </WkField>
                    <WkButton variant="primary" onClick={grant} disabled={pending || !username.trim()}>
                        {pending ? '授权中…' : '授权'}
                    </WkButton>
                </div>
                <p className="wk-meta">该用户需要已设置用户名（登录过一次）。授权后立即生效，无需重新登录。</p>
            </div>

            <div>
                <div className="wk-section-head">
                    <h2 style={{ fontSize: 'var(--wk-t-sec)' }}>授权树</h2>
                    <span className="wk-meta">
                        共 {admins.length} 位 · 最深 {maxDepth} 层
                    </span>
                </div>

                {admins.length === 0 ? (
                    <WkEmpty title="暂无管理员" hint="请通过 SQL 引导首位根管理员" />
                ) : (
                    <div className="wk-tree">
                        {roots.map((root) => (
                            <TreeNodeView
                                key={root.item.id}
                                node={root}
                                pending={pending}
                                onRevoke={setRevoking}
                            />
                        ))}
                    </div>
                )}
            </div>

            <WkConfirm
                open={!!revoking}
                onClose={() => setRevoking(null)}
                title={`撤销「${revoking?.username ?? ''}」的管理员权限？`}
                description="他授出给其他人的权限会一并收回（连坐）。此操作不可撤销，需要时可重新授权。"
                confirmLabel="撤销并连坐收回"
                busy={pending}
                onConfirm={() => revoking && revoke(revoking)}
            />
        </div>
    )
}
