#!/usr/bin/env node
/**
 * 工坊 Buff 文件夹迁移工具（备份 / 映射预览 / 生成 SQL）
 *
 * 用法：
 *   node scripts/buff-migration/buff-migration.mjs backup
 *   node scripts/buff-migration/buff-migration.mjs preview
 *   node scripts/buff-migration/buff-migration.mjs generate
 *   node scripts/buff-migration/buff-migration.mjs all
 *
 * 只读备份通过 Supabase REST + service role；SQL 由本地生成后交给 SQL Editor 执行。
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = join(ROOT, '.tmp', 'backups')
const BASE_SQL = join(ROOT, 'supabase', 'migrations', 'buff-folders-v2.sql')
const COLLATOR = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })

const readEnv = (...files) => {
    const env = {}
    for (const file of files) {
        const path = join(ROOT, file)
        if (!existsSync(path)) continue
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
            if (!m) continue
            env[m[1]] = m[2].replace(/^["']|["']$/g, '')
        }
    }
    return env
}

const env = readEnv('.dev.vars', '.env.local')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
    console.error('缺少 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
}

const rest = async (path) => {
    const res = await fetch(`${url}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
    })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`${path} -> HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    return res.json()
}

const sql = (v) => (v == null ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`)
const jsonSql = (v) => (v == null ? 'NULL' : `${sql(JSON.stringify(v))}::jsonb`)
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')
const latestBackup = () => {
    if (!existsSync(OUT)) throw new Error('还没有备份，先运行 backup')
    const files = readdir(OUT)
        .filter((f) => /^buff-backup-.*\.json$/.test(f))
        .sort()
    if (!files.length) throw new Error('还没有备份，先运行 backup')
    return readFileSync(join(OUT, files[files.length - 1]), 'utf8')
}
import { readdirSync as readdir } from 'node:fs'

const parseNumeric = (name) => {
    const m = String(name).match(/^(.+?)(\d+)([^\d]*)$/)
    if (!m) return null
    const prefix = m[1].trimEnd()
    if (!prefix) return null
    return { prefix, num: Number(m[2]), suffix: m[3] }
}

const uniqueName = (desired, used) => {
    let name = desired
    while (used.has(name)) name += '#'
    used.add(name)
    return name
}

const numericFolderName = (prefix, suffix, used) => {
    if (!used.has(prefix)) {
        used.add(prefix)
        return prefix
    }
    return uniqueName(`${prefix}（${suffix}）`.trim(), used)
}

const entityKeyOf = (row) => `${row.entity_type}\u0000${row.entity_name}`

/** 与工具箱同口径：前缀 + 后缀 ≥2 才建文件夹；后缀不同不合并 */
const buildMapping = (rows) => {
    const byEntity = new Map()
    for (const row of rows) {
        const key = entityKeyOf(row)
        if (!byEntity.has(key)) {
            byEntity.set(key, { entityType: row.entity_type, entityName: row.entity_name, rows: [] })
        }
        byEntity.get(key).rows.push(row)
    }

    const mapping = []
    for (const entity of byEntity.values()) {
        const groups = new Map()
        for (const row of entity.rows) {
            const parsed = parseNumeric(row.buff_name)
            if (!parsed) continue
            const key = `${parsed.prefix}\u0000${parsed.suffix}`
            if (!groups.has(key)) groups.set(key, { ...parsed, rows: [] })
            groups.get(key).rows.push({ row, ...parsed })
        }
        const active = [...groups.values()]
            .filter((group) => group.rows.length >= 2)
            .sort((a, b) => COLLATOR.compare(a.prefix, b.prefix) || COLLATOR.compare(a.suffix, b.suffix))
        const activeRows = new Set(active.flatMap((group) => group.rows.map((item) => item.row.buff_name)))
        const direct = entity.rows.filter((row) => !activeRows.has(row.buff_name))
        const directNames = new Set(direct.map((row) => row.buff_name))
        const usedFolders = new Set()

        const folders = active.map((group) => {
            const folderName = numericFolderName(group.prefix, group.suffix, new Set([...directNames, ...usedFolders]))
            usedFolders.add(folderName)
            const childNames = new Set()
            const children = [...group.rows]
                .sort((a, b) => a.num - b.num || COLLATOR.compare(a.suffix, b.suffix))
                .map((item) => {
                    const short = uniqueName(`${item.num}${item.suffix}`, childNames)
                    return { row: item.row, short, full: `${folderName}\\${short}` }
                })
            return { folderName, children }
        })

        let sortOrder = 0
        const folderRows = []
        const buffRows = []
        for (const [index, folder] of folders.entries()) {
            folderRows.push({
                entity_type: entity.entityType,
                entity_name: entity.entityName,
                name: folder.folderName,
                sort_order: index
            })
            for (const child of folder.children) {
                buffRows.push({
                    id: child.row.id,
                    entity_type: child.row.entity_type,
                    entity_name: child.row.entity_name,
                    old_name: child.row.buff_name,
                    new_name: child.full,
                    folder: folder.folderName,
                    short_name: child.short,
                    sort_order: sortOrder++
                })
            }
        }
        for (const row of direct) {
            buffRows.push({
                id: row.id,
                entity_type: row.entity_type,
                entity_name: row.entity_name,
                old_name: row.buff_name,
                new_name: row.buff_name,
                folder: '',
                short_name: row.buff_name,
                sort_order: sortOrder++
            })
        }
        mapping.push({ entity, folders: folderRows, buffs: buffRows })
    }
    return mapping
}

const backup = async () => {
    mkdirSync(OUT, { recursive: true })
    console.log('读取 buff_sets / buff_set_snapshot ...')
    const buffs = await rest('buff_sets?select=*&order=entity_type.asc,entity_name.asc,buff_name.asc')
    let snapshots = []
    try {
        snapshots = await rest('buff_set_snapshot?select=*&order=created_at.asc')
    } catch (e) {
        console.warn(String(e.message).slice(0, 200))
    }
    let folders = []
    try {
        folders = await rest('buff_folders?select=*')
    } catch {
        // 迁移前通常还没有该表
    }
    const ts = stamp()
    const data = {
        exportedAt: new Date().toISOString(),
        sourceUrl: url,
        buffs,
        snapshots,
        folders
    }
    const jsonPath = join(OUT, `buff-backup-${ts}.json`)
    writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8')

    const lines = [
        '-- 工坊 Buff 集迁移前数据备份（旧结构）',
        `-- 导出时间：${data.exportedAt}`,
        `-- buff_sets ${buffs.length} 行 / buff_set_snapshot ${snapshots.length} 行`,
        '',
        'BEGIN;',
        'DELETE FROM public.buff_sets WHERE true;'
    ]
    if (buffs.length) {
        lines.push(
            'INSERT INTO public.buff_sets (entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set) VALUES',
            buffs
                .map(
                    (r) =>
                        `(${sql(r.entity_type)},${sql(r.entity_name)},${sql(r.buff_name)},${sql(r.scope)},${r.exclusive ? 'true' : 'false'},${jsonSql(r.condition)},${jsonSql(r.buff_set)})`
                )
                .join(',\n') + ';'
        )
    }
    if (snapshots.length) {
        lines.push(
            'DELETE FROM public.buff_set_snapshot WHERE true;',
            'INSERT INTO public.buff_set_snapshot (id, created_by, created_at, note, state, diff, is_root, prev_id) VALUES',
            snapshots
                .map(
                    (s) =>
                        `(${sql(s.id)}::uuid,${s.created_by ? `${sql(s.created_by)}::uuid` : 'NULL'},${sql(s.created_at)}::timestamptz,${sql(s.note)},${jsonSql(s.state)},${jsonSql(s.diff)},${s.is_root ? 'true' : 'false'},${s.prev_id ? `${sql(s.prev_id)}::uuid` : 'NULL'})`
                )
                .join(',\n') + ';'
        )
    }
    lines.push('COMMIT;', '')
    const sqlPath = join(OUT, `buff-backup-${ts}.sql`)
    writeFileSync(sqlPath, lines.join('\n'), 'utf8')
    console.log(`已备份：${jsonPath}`)
    console.log(`已备份：${sqlPath}`)
}

const preview = () => {
    const data = JSON.parse(latestBackup())
    const mapping = buildMapping(data.buffs ?? [])
    mkdirSync(OUT, { recursive: true })
    const ts = stamp()
    const previewData = {
        generatedAt: new Date().toISOString(),
        buffCount: data.buffs.length,
        folderCount: mapping.reduce((sum, e) => sum + e.folders.length, 0),
        entities: mapping.map((e) => ({
            entity_type: e.entity.entityType,
            entity_name: e.entity.entityName,
            folders: e.folders,
            buffs: e.buffs
        }))
    }
    const jsonPath = join(OUT, `buff-mapping-preview-${ts}.json`)
    writeFileSync(jsonPath, JSON.stringify(previewData, null, 2), 'utf8')
    const csv = [
        'entity_type,entity_name,old_name,new_name,folder,short_name,sort_order',
        ...mapping.flatMap((e) =>
            e.buffs.map((b) =>
                [b.entity_type, b.entity_name, b.old_name, b.new_name, b.folder, b.short_name, b.sort_order]
                    .map((v) => `"${String(v).replaceAll('"', '""')}"`)
                    .join(',')
            )
        )
    ].join('\n')
    const csvPath = join(OUT, `buff-mapping-preview-${ts}.csv`)
    writeFileSync(csvPath, csv, 'utf8')
    console.log(`映射预览：${jsonPath}`)
    console.log(`映射预览：${csvPath}`)
    console.log(`Buff ${previewData.buffCount} 行 / 文件夹 ${previewData.folderCount} 个`)
    for (const e of previewData.entities) {
        if (!e.folders.length) continue
        console.log(`  ${e.entity_type}/${e.entity_name}: ${e.folders.map((f) => f.name).join('、')}`)
    }
}

const generate = () => {
    const data = JSON.parse(latestBackup())
    const mapping = buildMapping(data.buffs ?? [])
    const base = readFileSync(BASE_SQL, 'utf8')
        .replace(/^\s*begin;\s*$/gim, '')
        .replace(/^\s*commit;\s*$/gim, '')
    const ts = stamp()
    const lines = [
        '-- ═══════════════════════════════════════════════════════════',
        '-- 工坊 Buff 文件夹迁移（基础结构 + 数据 + 新基线）',
        `-- 生成时间：${data.exportedAt} 的备份`,
        '-- 执行前请先运行 backup，并在 SQL Editor 里先跑预演脚本',
        '-- ═══════════════════════════════════════════════════════════',
        '',
        'BEGIN;',
        'LOCK TABLE public.buff_sets IN ACCESS EXCLUSIVE MODE;',
        '',
        base,
        '',
        '-- 迁移期先移除全名唯一索引，避免改名过程中的瞬时冲突',
        'DROP INDEX IF EXISTS public.buff_sets_entity_name_unique;',
        'DELETE FROM public.buff_folders WHERE true;',
        ''
    ]

    for (const entity of mapping) {
        for (const folder of entity.folders) {
            lines.push(
                `INSERT INTO public.buff_folders (entity_type, entity_name, name, sort_order) VALUES (${sql(folder.entity_type)},${sql(folder.entity_name)},${sql(folder.name)},${folder.sort_order});`
            )
        }
        for (const buff of entity.buffs) {
            lines.push(
                `UPDATE public.buff_sets SET buff_name = ${sql(buff.new_name)}, sort_order = ${buff.sort_order} WHERE entity_type = ${sql(buff.entity_type)} AND entity_name = ${sql(buff.entity_name)} AND buff_name = ${sql(buff.old_name)};`
            )
        }
    }

    const expectedBuffs = mapping.reduce((sum, e) => sum + e.buffs.length, 0)
    const expectedFolders = mapping.reduce((sum, e) => sum + e.folders.length, 0)
    lines.push(
        '',
        'CREATE UNIQUE INDEX buff_sets_entity_name_unique ON public.buff_sets (entity_type, entity_name, buff_name);',
        '',
        '-- 新基线快照（state = { buffs, folders }）',
        'INSERT INTO public.buff_set_snapshot (created_by, note, state, is_root)',
        "SELECT NULL, '迁移到文件夹结构', jsonb_build_object(",
        "  'buffs', (SELECT coalesce(jsonb_agg(to_jsonb(b) - 'created_at'), '[]'::jsonb) FROM public.buff_sets b),",
        "  'folders', (SELECT coalesce(jsonb_agg(to_jsonb(f) - 'created_at'), '[]'::jsonb) FROM public.buff_folders f)",
        '), true;',
        '',
        '-- 断言：行数、空名、重复全名',
        'DO $$',
        'DECLARE',
        `  v_buffs int; v_folders int;`,
        'BEGIN',
        '  SELECT count(*) INTO v_buffs FROM public.buff_sets;',
        '  SELECT count(*) INTO v_folders FROM public.buff_folders;',
        `  IF v_buffs <> ${expectedBuffs} THEN RAISE EXCEPTION 'buff_sets 行数不符：% <> ${expectedBuffs}', v_buffs; END IF;`,
        `  IF v_folders <> ${expectedFolders} THEN RAISE EXCEPTION 'buff_folders 行数不符：% <> ${expectedFolders}', v_folders; END IF;`,
        "  IF EXISTS (SELECT 1 FROM public.buff_sets WHERE buff_name = '' OR buff_name IS NULL) THEN RAISE EXCEPTION '存在空 Buff 名'; END IF;",
        'END $$;',
        '',
        'COMMIT;',
        ''
    )
    const sqlPath = join(OUT, `migrate-buff-folders-${ts}.sql`)
    writeFileSync(sqlPath, lines.join('\n'), 'utf8')

    const dry = lines
        .map((line) => (line === 'COMMIT;' ? 'ROLLBACK;' : line))
        .join('\n')
    const dryPath = join(OUT, `migrate-buff-folders-dryrun-${ts}.sql`)
    writeFileSync(dryPath, dry, 'utf8')

    const rollback = [
        '-- 回滚：恢复旧 Buff 名到根（旧快照已按计划删除，需用备份文件手工恢复）',
        'BEGIN;',
        'DROP INDEX IF EXISTS public.buff_sets_entity_name_unique;',
        'DELETE FROM public.buff_folders WHERE true;',
        `DELETE FROM public.buff_sets WHERE true;`,
        'INSERT INTO public.buff_sets (entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set) VALUES',
        (data.buffs ?? [])
            .map(
                (r) =>
                    `(${sql(r.entity_type)},${sql(r.entity_name)},${sql(r.buff_name)},${sql(r.scope)},${r.exclusive ? 'true' : 'false'},${jsonSql(r.condition)},${jsonSql(r.buff_set)})`
            )
            .join(',\n') + ';',
        'CREATE UNIQUE INDEX buff_sets_entity_name_unique ON public.buff_sets (entity_type, entity_name, buff_name);',
        'COMMIT;',
        ''
    ].join('\n')
    const rollbackPath = join(OUT, `rollback-buff-folders-${ts}.sql`)
    writeFileSync(rollbackPath, rollback, 'utf8')

    console.log(`正式迁移：${sqlPath}`)
    console.log(`预演迁移：${dryPath}`)
    console.log(`回滚脚本：${rollbackPath}`)
    console.log(`预期：Buff ${expectedBuffs} 行 / 文件夹 ${expectedFolders} 个`)
}

const cmd = process.argv[2] ?? 'all'
try {
    if (cmd === 'backup' || cmd === 'all') await backup()
    if (cmd === 'preview' || cmd === 'all') preview()
    if (cmd === 'generate' || cmd === 'all') generate()
} catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
}
