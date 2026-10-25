-- ─────────────────────────────────────────────────────────────
-- 编辑锁（增量脚本）：给已有的库补上「全局编辑锁 + 条目级锁」。
-- 全新部署直接跑 init.sql 即可（末尾已包含同一段、同样幂等）。
--
-- 语义：
--   * edit_locks 全局锁关闭（locked = false）→ 登录用户都能编辑对应域（buff 集 / 标准词条集）
--   * 条目级锁（buff_set_locks / substat_set_locks）→ 该条目仍只允许管理员编辑
--   * 缺行 / 读不到表 → 一律视为「锁定」，即退回当前「仅管理员可编辑」的现状（fail-closed）
--   * 删改「整实体」与快照仍由站点侧限制为管理员；本脚本只放开单条编辑的库级权限
-- ─────────────────────────────────────────────────────────────

-- 1. 全局开关（两个域各一行）
create table if not exists public.edit_locks (
    scope      text primary key,
    locked     boolean not null default true,
    updated_at timestamptz not null default now(),
    check (scope in ('buff_sets', 'substat_sets'))
);

insert into public.edit_locks (scope, locked)
values ('buff_sets', true), ('substat_sets', true)
on conflict (scope) do nothing;

drop trigger if exists edit_locks_set_updated_at on public.edit_locks;
create trigger edit_locks_set_updated_at
    before update on public.edit_locks
    for each row
    execute function public.set_updated_at ();

alter table public.edit_locks enable row level security;

drop policy if exists edit_locks_public_read on public.edit_locks;
create policy edit_locks_public_read on public.edit_locks
    for select
    using (true);

drop policy if exists edit_locks_admin_write on public.edit_locks;
create policy edit_locks_admin_write on public.edit_locks
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

grant select on public.edit_locks to anon, authenticated;
grant insert, update, delete on public.edit_locks to authenticated;
grant all on public.edit_locks to service_role;

-- 2. 条目级锁：buff 集按「实体」、标准词条集按「角色」
create table if not exists public.buff_set_locks (
    entity_type text not null,
    entity_name text not null,
    locked      boolean not null default true,
    primary key (entity_type, entity_name),
    check (entity_type in ('character', 'weapon', 'echo', '1set', '2set', '3set', '4set', '5set'))
);

create table if not exists public.substat_set_locks (
    character_name text primary key,
    locked         boolean not null default true
);

alter table public.buff_set_locks enable row level security;
alter table public.substat_set_locks enable row level security;

-- 公开只读：站点要渲染「哪些条目被锁」，RLS 策略里也要读它
drop policy if exists buff_set_locks_public_read on public.buff_set_locks;
create policy buff_set_locks_public_read on public.buff_set_locks
    for select
    using (true);

drop policy if exists substat_set_locks_public_read on public.substat_set_locks;
create policy substat_set_locks_public_read on public.substat_set_locks
    for select
    using (true);

drop policy if exists buff_set_locks_admin_write on public.buff_set_locks;
create policy buff_set_locks_admin_write on public.buff_set_locks
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

drop policy if exists substat_set_locks_admin_write on public.substat_set_locks;
create policy substat_set_locks_admin_write on public.substat_set_locks
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

grant select on public.buff_set_locks, public.substat_set_locks to anon, authenticated;
grant insert, update, delete on public.buff_set_locks, public.substat_set_locks to authenticated;
grant all on public.buff_set_locks, public.substat_set_locks to service_role;

-- 3. 判定函数：全局锁是否开启（security definer：策略里调用不触发 RLS 递归）
create or replace function public.domain_edit_locked (p_scope text)
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
as $$
    select coalesce ((select locked from public.edit_locks where scope = p_scope), true);
$$;

grant execute on function public.domain_edit_locked (text) to anon, authenticated;

-- 4. 写入策略：管理员随时可写；全局锁关闭 + 该条目未被单独锁定时，登录用户也可写
drop policy if exists buff_sets_admin_all on public.buff_sets;
drop policy if exists buff_sets_edit on public.buff_sets;
create policy buff_sets_edit on public.buff_sets
    for all to authenticated
    using (
        public.is_admin ()
        or (
            not public.domain_edit_locked ('buff_sets')
            and not coalesce ((
                select l.locked
                from public.buff_set_locks l
                where l.entity_type = buff_sets.entity_type
                  and l.entity_name = buff_sets.entity_name
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
                where l.entity_type = buff_sets.entity_type
                  and l.entity_name = buff_sets.entity_name
            ), false)
        )
    );

drop policy if exists standard_substat_sets_admin_all on public.standard_substat_sets;
drop policy if exists standard_substat_sets_edit on public.standard_substat_sets;
create policy standard_substat_sets_edit on public.standard_substat_sets
    for all to authenticated
    using (
        public.is_admin ()
        or (
            not public.domain_edit_locked ('substat_sets')
            and not coalesce ((
                select l.locked
                from public.substat_set_locks l
                where l.character_name = standard_substat_sets.character_name
            ), false)
        )
    )
    with check (
        public.is_admin ()
        or (
            not public.domain_edit_locked ('substat_sets')
            and not coalesce ((
                select l.locked
                from public.substat_set_locks l
                where l.character_name = standard_substat_sets.character_name
            ), false)
        )
    );

-- 通知 PostgREST 重载 schema 缓存（新表 / 新函数要等缓存刷新后才能经 REST 访问）
notify pgrst, 'reload schema';
