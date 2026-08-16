-- ═══════════════════════════════════════════════════════════════
-- [升级] Buff 集快照：单快照 → 根 + 版本链
-- 适用：已执行旧版快照机制（buff_set_snapshot 单行表 +
--       save_buff_set_snapshot(jsonb,text) / restore_buff_set_snapshot()）的线上库。
-- 全新库请直接执行 0001_init.sql（已含本升级后的结构），无需执行本文件。
--
-- 新机制：
--   根快照 = 全量基准（state 完整复制整个 Buff 集），不可删除；
--   版本快照 = 相对前一状态的差异（diff 只存差异），沿 prev_id 构成单向链；
--   创建：无根 → 建根；有根 → 追加版本；恢复：可恢复到任意版本/根
--         （级联删除比目标新的版本，git reset 语义）；
--   删除：仅最新版本可删除（根与中间版本拒绝）。
-- 存量单行快照自动升级为根，数据零损失。
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. 表结构升级
-- ─────────────────────────────────────────────────────────────
alter table public.buff_set_snapshot
    add column if not exists diff jsonb,
    add column if not exists is_root boolean not null default false,
    add column if not exists prev_id uuid references public.buff_set_snapshot (id) on delete cascade;

-- 旧单例约束（全表至多一行）废弃
drop index if exists buff_set_snapshot_singleton;

-- 版本行的 state 为 null（仅根存全量）
alter table public.buff_set_snapshot alter column state drop not null;
alter table public.buff_set_snapshot alter column state drop default;

-- 单向链：每个快照至多一个后继
create unique index if not exists buff_set_snapshot_chain
    on public.buff_set_snapshot (prev_id) where prev_id is not null;

-- 根至多一个
create unique index if not exists buff_set_snapshot_root_one
    on public.buff_set_snapshot ((true)) where is_root;

-- 存量单行 → 根（数据零损失）
update public.buff_set_snapshot set is_root = true where is_root = false;

-- 结构约束（PostgreSQL 无 ADD CONSTRAINT IF NOT EXISTS，用 do block 幂等处理）
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'buff_set_snapshot_shape') then
        alter table public.buff_set_snapshot add constraint buff_set_snapshot_shape check (
            (is_root and state is not null and diff is null and prev_id is null)
            or (not is_root and diff is not null and state is null and prev_id is not null)
        );
    end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. 旧 RPC（签名已变更）先 drop，避免 42P13
-- ─────────────────────────────────────────────────────────────
drop function if exists public.save_buff_set_snapshot (jsonb, text);
drop function if exists public.restore_buff_set_snapshot ();

-- ─────────────────────────────────────────────────────────────
-- 3. 保存快照：p_state 非空 → 创建根（全量复制）；p_diff 非空 → 追加版本
-- ─────────────────────────────────────────────────────────────
create or replace function public.save_buff_set_snapshot (p_state jsonb, p_diff jsonb, p_note text default '')
    returns text
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_root_id uuid;
    v_latest_id uuid;
begin
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行该操作';
    end if;

    select id into v_root_id from public.buff_set_snapshot where is_root limit 1;

    if v_root_id is null then
        -- 无根：原原本本复制整个 Buff 集
        if p_state is null then
            raise exception '缺少全量状态';
        end if;
        insert into public.buff_set_snapshot (created_by, note, state, is_root)
        values (auth.uid (), coalesce (p_note, ''), p_state, true);
        return '已创建根快照';
    end if;

    -- 有根：追加版本（diff = 相对当前最新版本状态）
    if p_diff is null then
        raise exception '缺少版本差异';
    end if;
    select id into v_latest_id
    from public.buff_set_snapshot s
    where not exists (select 1 from public.buff_set_snapshot s2 where s2.prev_id = s.id)
    order by created_at desc
    limit 1;

    insert into public.buff_set_snapshot (created_by, note, diff, prev_id)
    values (auth.uid (), coalesce (p_note, ''), p_diff, v_latest_id);
    return '已创建版本快照';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. 恢复快照：单事务回写 + 级联删除比目标新的版本（目标与根保留）
-- ─────────────────────────────────────────────────────────────
create or replace function public.restore_buff_set_snapshot (p_target uuid, p_state jsonb)
    returns table (restored int)
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_count int := 0;
    v_exists boolean;
begin
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行该操作';
    end if;
    if p_target is null or p_state is null then
        raise exception '参数缺失';
    end if;

    select exists (select 1 from public.buff_set_snapshot where id = p_target) into v_exists;
    if not v_exists then
        raise exception '快照不存在';
    end if;

    -- 级联删除比目标新的版本（从链尾沿 prev_id 收集，排除目标与根）
    with recursive tail as (
        select id, prev_id
        from public.buff_set_snapshot
        where not exists (select 1 from public.buff_set_snapshot s2 where s2.prev_id = public.buff_set_snapshot.id)
        union all
        select s.id, s.prev_id
        from public.buff_set_snapshot s
        join tail t on s.id = t.prev_id
    )
    delete from public.buff_set_snapshot
    where id in (select id from tail)
      and id <> p_target
      and is_root = false;

    -- 单事务回写 Buff 集（显式 where true：平台会拦截无 WHERE 的 DELETE）
    delete from public.buff_sets where true;

    insert into public.buff_sets (entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set)
    select
        el ->> 'entity_type',
        el ->> 'entity_name',
        el ->> 'buff_name',
        coalesce (el ->> 'scope', 'team'),
        coalesce ((el ->> 'exclusive')::boolean, false),
        el -> 'condition',
        coalesce (el -> 'buff_set', '[]'::jsonb)
    from jsonb_array_elements (p_state) el;

    get diagnostics v_count = row_count;
    return query select v_count;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 5. 删除版本快照：仅最新版本可删（根与中间版本拒绝）
-- ─────────────────────────────────────────────────────────────
create or replace function public.delete_buff_set_snapshot (p_id uuid)
    returns text
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_is_root boolean;
begin
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行该操作';
    end if;

    select is_root into v_is_root from public.buff_set_snapshot where id = p_id;
    if v_is_root is null then
        raise exception '快照不存在';
    end if;
    if v_is_root then
        raise exception '根快照不可删除';
    end if;
    if exists (select 1 from public.buff_set_snapshot s2 where s2.prev_id = p_id) then
        raise exception '仅可删除最新版本快照';
    end if;

    delete from public.buff_set_snapshot where id = p_id;
    return '已删除版本快照';
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. 执行授权
-- ─────────────────────────────────────────────────────────────
grant execute on function public.save_buff_set_snapshot (jsonb, jsonb, text) to authenticated;
grant execute on function public.restore_buff_set_snapshot (uuid, jsonb) to authenticated;
grant execute on function public.delete_buff_set_snapshot (uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 验证：
--   select count(*) from buff_set_snapshot where is_root;  -- 期望 1（存量行已转根）
--   select proname, pg_get_function_arguments(oid) from pg_proc
--   where proname in ('save_buff_set_snapshot','restore_buff_set_snapshot','delete_buff_set_snapshot')
--   order by proname;  -- 期望三行、签名与上文一致
-- ═══════════════════════════════════════════════════════════════
