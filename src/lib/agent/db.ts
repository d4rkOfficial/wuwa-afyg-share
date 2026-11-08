// AI 控制台的本地持久化（IndexedDB）。
//
// 目的只有一个：**关掉浏览器再回来，任务还在**。任务的每一次状态变化都整份写回，
// 所以刷新/断网/关页最多丢掉「正在流式输出但还没落盘的那半句」，不会丢已完成的结果与审批记录。
//
// 刻意不引入依赖：只需要一个 keyPath = id 的对象仓库 + 按 updatedAt 排序的列表。
import type { AgentTask } from '@/lib/agent/types'

const DB_NAME = 'wuwa-afyg-agent'
const DB_VERSION = 1
const STORE = 'tasks'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') return Promise.reject(new Error('当前环境不支持 IndexedDB'))
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION)
            req.onupgradeneeded = () => {
                const db = req.result
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
            }
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error ?? new Error('打开本地数据库失败'))
        })
    }
    return dbPromise
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return openDb().then(
        (db) =>
            new Promise<T>((resolve, reject) => {
                const transaction = db.transaction(STORE, mode)
                const req = fn(transaction.objectStore(STORE))
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error ?? new Error('本地数据库读写失败'))
            })
    )
}

export async function putTask(task: AgentTask): Promise<void> {
    await tx('readwrite', (store) => store.put(task) as IDBRequest<IDBValidKey>)
}

export async function deleteTask(id: string): Promise<void> {
    await tx('readwrite', (store) => store.delete(id) as IDBRequest<undefined>)
}

export async function getTask(id: string): Promise<AgentTask | undefined> {
    return (await tx<AgentTask | undefined>('readonly', (store) => store.get(id))) ?? undefined
}

export async function listTasks(): Promise<AgentTask[]> {
    const all = await tx<AgentTask[]>('readonly', (store) => store.getAll() as IDBRequest<AgentTask[]>)
    return (all ?? []).sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * @desc 页面重开时的状态修复：
 * - `running` / `waiting-approval` 说明上次是「跑到一半页面没了」→ 标成 `interrupted`，
 *   并把「发给模型但没拿到结果的那一步」标出来（run 时会重跑该步，见 agent/run.ts）。
 * - 其它状态原样保留。
 */
export function normalizeRestoredTask(task: AgentTask): AgentTask {
    if (task.status !== 'running' && task.status !== 'waiting-approval') return task
    return {
        ...task,
        status: 'interrupted',
        pendingApproval: null,
        activities: [...task.activities, { kind: 'status', text: '页面关闭导致中断，可点「继续」从断点重跑' }],
        updatedAt: Date.now()
    }
}
