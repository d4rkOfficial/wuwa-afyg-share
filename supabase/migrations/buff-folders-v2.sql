-- ═══════════════════════════════════════════════════════════════
-- Buff 集文件夹 + 全名 + 快照 v2（基础结构）
-- 先备份 buff_sets / buff_set_snapshot，再执行本文件；
-- 数据迁移（重命名 + 建文件夹）由 migrate-buff-folders.generated.sql 执行。
-- ═══════════════════════════════════════════════════════════════

begin;

-- 1. buff_sets：稳定 id + 排序；buff_name 存全名（文件夹A\短名）
alter table public.buff_sets add column if not exists id uuid default gen_random_uuid ();
alter table public.buff_sets add column if not exists sort_order int not null default 0;
update public.buff_sets set id = gen_random_uuid () where id is null;
alter table public.buff_sets alter column id set not null;

alter table public.buff_sets drop constraint if exists buff_sets_pkey;
alter table public.buff_sets add constraint buff_sets_pkey primary key (id);
create unique index if not exists buff_sets_entity_name_unique
    on public.buff_sets (entity_type, entity_name, buff_name);
create index if not exists buff_sets_entity_order
    on public.buff_sets (entity_type, entity_name, sort_order);

-- 2. 一级文件夹：只存短名/排序；成员按 buff_name 的 `文件夹\` 前缀归属
create table if not exists public.buff_folders (
    id          uuid primary key default gen_random_uuid (),
    entity_type text not null,
    entity_name text not null,
    name        text not null,
    sort_order  int not null default 0,
    created_at  timestamptz not null default now (),
    check (entity_type in ('character', 'weapon', 'echo', '1set', '2set', '3set', '4set', '5set')),
    unique (entity_type, entity_name, name)
);

create index if not exists buff_folders_entity_order
    on public.buff_folders (entity_type, entity_name, sort_order);

alter table public.buff_folders enable row level security;

drop policy if exists buff_folders_public_read on public.buff_folders;
create policy buff_folders_public_read on public.buff_folders
    for select
    using (true);

drop policy if exists buff_folders_edit on public.buff_folders;
create policy buff_folders_edit on public.buff_folders
    for all to authenticated
    using (
        public.is_admin ()
        or (
            not public.domain_edit_locked ('buff_sets')
            and not coalesce ((
                select l.locked
                from public.buff_set_locks l
                where l.entity_type = buff_folders.entity_type
                  and l.entity_name = buff_folders.entity_name
            ), false)
        )
    )
    with check (
        public.is_admin ()
        or (
            not public.domain_edit_locked ('buff_sets')
            and not coalesce ((
                select l.locked
                from public.buff_set_locks l
                where l.entity_type = buff_folders.entity_type
                  and l.entity_name = buff_folders.entity_name
            ), false)
        )
    );

grant select on public.buff_folders to anon, authenticated;
grant insert, update, delete on public.buff_folders to authenticated;
grant select, insert, update, delete on public.buff_folders to service_role;

-- 3. 快照 v2：删除旧表/函数，重建同名表；state = { buffs, folders }
drop function if exists public.restore_buff_set_snapshot (uuid, jsonb);
drop function if exists public.restore_buff_set_snapshot_v2 (uuid, jsonb);
drop function if exists public.save_buff_set_snapshot (jsonb, jsonb, text);
drop function if exists public.delete_buff_set_snapshot (uuid);
drop function if exists public.squash_buff_set_snapshot (jsonb, text);
drop table if exists public.buff_set_snapshot cascade;

create table public.buff_set_snapshot (
    id         uuid primary key default gen_random_uuid (),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now (),
    note       text not null default '',
    state      jsonb, -- 仅根快照：{ buffs: BuffSetRow[], folders: BuffFolderRow[] }
    diff       jsonb, -- 仅版本快照：{ added, modified, removed, folders: {...} }
    is_root    boolean not null default false,
    prev_id    uuid references public.buff_set_snapshot (id) on delete cascade,
    check (
        (is_root and state is not null and diff is null and prev_id is null)
        or (not is_root and diff is not null and state is null and prev_id is not null)
    )
);

create unique index buff_set_snapshot_chain
    on public.buff_set_snapshot (prev_id) where prev_id is not null;

create unique index buff_set_snapshot_root_one
    on public.buff_set_snapshot ((true)) where is_root;

alter table public.buff_set_snapshot enable row level security;

create policy buff_set_snapshot_public_read on public.buff_set_snapshot
    for select
    using (true);

create policy buff_set_snapshot_admin_write on public.buff_set_snapshot
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

grant select on public.buff_set_snapshot to anon, authenticated;
grant insert, update, delete on public.buff_set_snapshot to authenticated;
grant select, insert, update, delete on public.buff_set_snapshot to service_role;

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
        if p_state is null then
            raise exception '缺少全量状态';
        end if;
        insert into public.buff_set_snapshot (created_by, note, state, is_root)
        values (auth.uid (), coalesce (p_note, ''), p_state, true);
        return '已创建根快照';
    end if;

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

create or replace function public.restore_buff_set_snapshot_v2 (p_target uuid, p_state jsonb)
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

    delete from public.buff_sets where true;
    delete from public.buff_folders where true;

    insert into public.buff_folders (id, entity_type, entity_name, name, sort_order)
    select
        coalesce ((el ->> 'id')::uuid, gen_random_uuid ()),
        el ->> 'entity_type',
        el ->> 'entity_name',
        el ->> 'name',
        coalesce ((el ->> 'sort_order')::int, 0)
    from jsonb_array_elements (coalesce(p_state -> 'folders', '[]'::jsonb)) el;

    insert into public.buff_sets (id, entity_type, entity_name, buff_name, scope, exclusive, condition, buff_set, sort_order)
    select
        coalesce ((el ->> 'id')::uuid, gen_random_uuid ()),
        el ->> 'entity_type',
        el ->> 'entity_name',
        el ->> 'buff_name',
        coalesce (el ->> 'scope', 'team'),
        coalesce ((el ->> 'exclusive')::boolean, false),
        el -> 'condition',
        coalesce (el -> 'buff_set', '[]'::jsonb),
        coalesce ((el ->> 'sort_order')::int, 0)
    from jsonb_array_elements (coalesce(p_state -> 'buffs', '[]'::jsonb)) el;

    get diagnostics v_count = row_count;
    return query select v_count;
end;
$$;

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

create or replace function public.squash_buff_set_snapshot (p_state jsonb, p_note text default null)
    returns text
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_root_id uuid;
    v_versions int;
begin
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行该操作';
    end if;
    if p_state is null then
        raise exception '缺少全量状态';
    end if;

    select id into v_root_id from public.buff_set_snapshot where is_root limit 1;
    if v_root_id is null then
        raise exception '暂无根快照';
    end if;

    select count(*) into v_versions from public.buff_set_snapshot where is_root = false;
    delete from public.buff_set_snapshot where is_root = false;

    update public.buff_set_snapshot
    set state = p_state,
        diff = null,
        prev_id = null,
        note = coalesce (p_note, note)
    where id = v_root_id;

    return format ('已合并 %s 个版本到根', v_versions);
end;
$$;

grant execute on function public.save_buff_set_snapshot (jsonb, jsonb, text) to authenticated;
grant execute on function public.restore_buff_set_snapshot_v2 (uuid, jsonb) to authenticated;
grant execute on function public.delete_buff_set_snapshot (uuid) to authenticated;
grant execute on function public.squash_buff_set_snapshot (jsonb, text) to authenticated;

commit;
