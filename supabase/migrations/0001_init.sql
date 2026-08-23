-- ═══════════════════════════════════════════════════════════════
-- 椰果工坊 · 全量初始化（单文件一次执行）
-- 已合并：历史迁移（工程/匿名分享/计数器/过期清理/资料/Buff 集/公告/GIN 索引）、
--         Buff 集单快照（0002）、管理员权限链（0003）、
--         工程保护与批量删除（0004）。
-- 评论功能已下线（不建 project_comments 表）。
-- 适用：全新数据库一次性执行；已初始化过的库请勿重跑。
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. 用户资料
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
    id         uuid primary key references auth.users (id) on delete cascade,
    username   text not null,
    is_admin   boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 用户名大小写不敏感唯一
create unique index if not exists profiles_username_lower_idx
    on public.profiles (lower(username));

-- updated_at 自动刷新
create or replace function public.set_updated_at ()
    returns trigger
    language plpgsql
    as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
    before update on public.profiles
    for each row
    execute function public.set_updated_at ();

alter table public.profiles enable row level security;

-- 用户名公开可见（供列表展示与页面查询）
create policy profiles_public_read on public.profiles
    for select
    using (true);

-- 仅本人可写入
create policy profiles_own_insert on public.profiles
    for insert to authenticated
    with check (auth.uid () = id);

create policy profiles_own_update on public.profiles
    for update to authenticated
    using (auth.uid () = id)
    with check (auth.uid () = id);

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
grant update (is_admin) on public.profiles to service_role;

-- ─────────────────────────────────────────────────────────────
-- 2. 管理员判定（权限链版）
-- 存在授权边即管理员；兼容存量 profiles.is_admin（SQL 直改仍生效）。
-- security definer：内部查询不触发 RLS，无递归。
-- 依赖 admin_grants 表（见第 9 节）——函数体延迟解析，首次调用时才校验。
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin ()
    returns boolean
    language sql
    security definer
    set search_path = public
as $$
    select exists (select 1 from public.admin_grants where grantee_id = auth.uid ())
        or coalesce ((select is_admin from public.profiles where id = auth.uid ()), false);
$$;

grant execute on function public.is_admin () to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. 工程表（匿名分享：author_id 可空）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.projects (
    id           uuid primary key default gen_random_uuid(),
    code         text not null unique,
    author_id    uuid references auth.users (id) on delete cascade,
    author_name  text not null default '匿名',
    title        text not null,
    description  text not null default '',
    tags         text[] not null default '{}',
    game_version text,
    team_preview jsonb,
    project_blob bytea not null, -- brotli 压缩后的完整工程文件（原始 ≤5MB，压缩后 ≤0.5MB）
    file_size    int not null default 0,
    published    boolean not null default true,
    expires_at   timestamptz,
    view_count   int not null default 0,
    clone_count  int not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    protected    boolean not null default false -- 保护工程：批量/单条删除与过期清理均豁免
);

create index if not exists projects_created_idx on public.projects (created_at desc);
create index if not exists projects_clones_idx on public.projects (clone_count desc);
create index if not exists projects_expires_idx on public.projects (expires_at);
create index if not exists projects_tags_idx on public.projects using gin (tags);
-- 首页角色筛选使用 JSONB 包含查询
create index if not exists projects_team_preview_gin_idx
    on public.projects using gin (team_preview jsonb_path_ops);

alter table public.projects enable row level security;

-- 公开只读可见工程（未过期 + 已发布）
create policy projects_public_read on public.projects
    for select
    using (published = true and (expires_at is null or expires_at > now()));

-- 作者本人（删除豁免保护工程）
create policy projects_author_select on public.projects
    for select to authenticated
    using (auth.uid () = author_id);
create policy projects_author_insert on public.projects
    for insert to authenticated
    with check (auth.uid () = author_id);
create policy projects_author_update on public.projects
    for update to authenticated
    using (auth.uid () = author_id)
    with check (auth.uid () = author_id);
create policy projects_author_delete on public.projects
    for delete to authenticated
    using (auth.uid () = author_id and protected = false);

-- 管理员（删除豁免保护工程）
create policy projects_admin_select on public.projects
    for select to authenticated
    using (public.is_admin ());
create policy projects_admin_insert on public.projects
    for insert to authenticated
    with check (public.is_admin ());
create policy projects_admin_update on public.projects
    for update to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());
create policy projects_admin_delete on public.projects
    for delete to authenticated
    using (public.is_admin () and protected = false);

grant select on public.projects to anon, authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.projects to service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. 计数器 RPC（匿名可调用，避免绕过 RLS 直接 UPDATE）
-- ─────────────────────────────────────────────────────────────
create or replace function public.bump_counter (p_id uuid, p_col text)
    returns void
    language plpgsql
    security definer
    set search_path = public as $$
begin
    if p_col = 'views' then
        update public.projects
        set view_count = view_count + 1
        where id = p_id;
    elsif p_col = 'clones' then
        update public.projects
        set clone_count = clone_count + 1
        where id = p_id;
    end if;
end;
$$;

grant execute on function public.bump_counter (uuid, text) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. 过期清理（pg_cron，每 5 分钟，跳过保护工程）
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

do $$
begin
    if exists (select 1 from cron.job where jobname = 'cleanup-expired-projects') then
        perform cron.unschedule ('cleanup-expired-projects');
    end if;
    perform cron.schedule (
        'cleanup-expired-projects',
        '*/5 * * * *',
        $cmd$ delete from public.projects
              where expires_at is not null and expires_at < now () and protected = false $cmd$
    );
end $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Buff 集表（游戏内实体固定 buff 数值库）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.buff_sets (
    entity_type text not null,
    entity_name text not null,
    buff_name   text not null,
    buff_set    jsonb not null,
    scope       text not null default 'team',
    exclusive   boolean not null default false,
    condition   jsonb, -- 生效条件：{"chain":n}|{"refinement":n}|{"elements":[]}|{"damageTypes":[]}，可并存
    primary key (entity_type, entity_name, buff_name),
    check (entity_type in ('character', 'weapon', 'echo', '1set', '2set', '3set', '4set', '5set')),
    check (scope in ('self', 'self_except', 'team', 'effect_only'))
);

alter table public.buff_sets enable row level security;

-- 公开只读
create policy buff_sets_public_read on public.buff_sets
    for select
    using (true);

-- 仅管理员可编辑（公开读策略不变；站点侧编辑同样仅管理员）
create policy buff_sets_admin_all on public.buff_sets
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

grant select on public.buff_sets to anon, authenticated;
grant insert, update, delete on public.buff_sets to authenticated;
grant select, insert, update, delete on public.buff_sets to service_role;

-- ─────────────────────────────────────────────────────────────
-- 7. 公告表（公开读，管理员增删改）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.announcements (
    id         uuid primary key default gen_random_uuid(),
    title      text not null default '',
    content    text not null,
    created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy announcements_public_read on public.announcements
    for select
    using (true);

create policy announcements_admin_all on public.announcements
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 8. Buff 集快照（根 + 版本链）
-- 根快照：全量基准（state 完整复制整个 Buff 集），不可删除；
-- 版本快照：相对前一状态的差异（diff 只存差异），沿 prev_id 构成单向链；
-- 创建：无根 → 建根（全量复制）；有根 → 追加版本（diff = 相对最新状态）；
-- 恢复：可恢复到任意版本/根（级联删除比目标新的版本，git reset 语义）；
-- 删除：仅最新版本可删除（根与中间版本不可删）；
-- 合并：squash 到根——以链尾重建全量替换根 state，清空全部版本节点，
--       链压回单行。用于版本过多、历史 diff 不再需要时重置基准。
-- ─────────────────────────────────────────────────────────────
-- 兼容重跑：旧单例索引已废弃
drop index if exists buff_set_snapshot_singleton;

create table if not exists public.buff_set_snapshot (
    id         uuid primary key default gen_random_uuid(),
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    note       text not null default '',
    state      jsonb, -- 仅根快照：全量 BuffSetRow 数组
    diff       jsonb, -- 仅版本快照：相对前一状态的差异 {added, modified, removed}
    is_root    boolean not null default false,
    prev_id    uuid references public.buff_set_snapshot (id) on delete cascade, -- 链：指向前一快照
    check (
        (is_root and state is not null and diff is null and prev_id is null)
        or (not is_root and diff is not null and state is null and prev_id is not null)
    )
);

-- 单向链：每个快照至多一个后继
create unique index if not exists buff_set_snapshot_chain
    on public.buff_set_snapshot (prev_id) where prev_id is not null;

-- 根至多一个
create unique index if not exists buff_set_snapshot_root_one
    on public.buff_set_snapshot ((true)) where is_root;

alter table public.buff_set_snapshot enable row level security;

-- 公开只读（快照内容本身是公开 buff 数据）
create policy buff_set_snapshot_public_read on public.buff_set_snapshot
    for select
    using (true);

-- 仅管理员写（写入统一走 RPC，此策略为兜底）
create policy buff_set_snapshot_admin_write on public.buff_set_snapshot
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

grant select on public.buff_set_snapshot to anon, authenticated;
grant insert, update, delete on public.buff_set_snapshot to authenticated;
grant select, insert, update, delete on public.buff_set_snapshot to service_role;

-- 保存快照：p_state 非空 → 创建根（全量复制）；p_diff 非空 → 追加版本（prev = 当前最新）
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

-- 恢复快照：p_state 为服务端重建的目标全量；单事务回写 +
-- 级联删除比目标新的版本（目标与根保留）
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

-- 删除版本快照：仅最新版本可删（根与中间版本拒绝）
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

grant execute on function public.save_buff_set_snapshot (jsonb, jsonb, text) to authenticated;
grant execute on function public.restore_buff_set_snapshot (uuid, jsonb) to authenticated;
grant execute on function public.delete_buff_set_snapshot (uuid) to authenticated;

-- 合并快照（squash 到根）：以服务端重建的最新全量状态替换根 state，清空全部版本节点。
-- 链压回单行（根）。用于版本过多、历史 diff 不再需要时重置基准。
-- p_state = 链尾重建全量；p_note = null 时保留原根 note，否则覆盖。
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

    select count(*) into v_versions
    from public.buff_set_snapshot
    where is_root = false;

    -- 删除全部版本节点（prev_id 链被 on delete cascade 自动清理级联引用）
    delete from public.buff_set_snapshot where is_root = false;

    -- 根以重建全量刷新基准；note 传入则覆盖，否则保留
    update public.buff_set_snapshot
    set state = p_state,
        diff = null,
        prev_id = null,
        note = coalesce (p_note, note)
    where id = v_root_id;

    return format ('已合并 %s 个版本到根', v_versions);
end;
$$;

grant execute on function public.squash_buff_set_snapshot (jsonb, text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9. 管理员权限链（0003）
-- admin_grants 记录「谁授予谁」的授权边；存在入边即管理员。
-- 根管理员（granted_by IS NULL，存量回填生成）不可经页面撤销，
-- 如需撤销请用 SQL：
--   delete from public.admin_grants where grantee_id = '<uuid>';
--   update public.profiles set is_admin = false where id = '<uuid>';
-- ─────────────────────────────────────────────────────────────
create table if not exists public.admin_grants (
    id         uuid primary key default gen_random_uuid(),
    grantee_id uuid not null references auth.users (id) on delete cascade,
    granted_by uuid references auth.users (id) on delete set null, -- null = 根管理员
    granted_at timestamptz not null default now()
);

-- 同一授权者 → 同一人 至多一条边（部分索引覆盖 NULL）
create unique index if not exists admin_grants_edge_unique
    on public.admin_grants (granted_by, grantee_id)
    where granted_by is not null;

-- 根授权至多一条
create unique index if not exists admin_grants_root_unique
    on public.admin_grants (grantee_id)
    where granted_by is null;

alter table public.admin_grants enable row level security;

-- 仅管理员可读（权限树展示）；写入仅走 definer RPC
create policy admin_grants_admin_read on public.admin_grants
    for select to authenticated
    using (public.is_admin ());

grant select on public.admin_grants to authenticated;
grant select, insert, update, delete on public.admin_grants to service_role;

-- 授权（按用户名，大小写不敏感）
create or replace function public.grant_admin (p_username text)
    returns text
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_profile public.profiles%rowtype;
begin
    if auth.uid () is null then
        raise exception '请先登录';
    end if;
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行该操作';
    end if;
    if p_username is null or length (trim (p_username)) = 0 then
        raise exception '用户名不能为空';
    end if;

    select * into v_profile
    from public.profiles
    where lower (username) = lower (trim (p_username))
    limit 1;
    if v_profile.id is null then
        raise exception '用户不存在或尚未设置用户名';
    end if;
    if v_profile.id = auth.uid () then
        raise exception '不能授予自己管理员权限';
    end if;

    insert into public.admin_grants (grantee_id, granted_by)
    values (v_profile.id, auth.uid ())
    on conflict do nothing;

    update public.profiles set is_admin = true where id = v_profile.id;

    return '已授予 ' || v_profile.username || ' 管理员权限';
end;
$$;

-- 撤销（仅授出者可收回自己的授权边；被撤者无其他入边时连坐收回其授出子树）
-- 级联：被撤者失去全部入边后，把所有「入边全部来自已判死集合」的受权者
-- 逐轮加入（不动点），随后删除该集合授出的全部授权边。
create or replace function public.revoke_admin (p_username text)
    returns text
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_profile public.profiles%rowtype;
    v_doomed uuid[] := '{}';
    v_changed boolean;
    v_row record;
    v_count int;
begin
    if auth.uid () is null then
        raise exception '请先登录';
    end if;
    if not public.is_admin () then
        raise exception '无权限：仅管理员可执行该操作';
    end if;
    if p_username is null or length (trim (p_username)) = 0 then
        raise exception '用户名不能为空';
    end if;

    select * into v_profile
    from public.profiles
    where lower (username) = lower (trim (p_username))
    limit 1;
    if v_profile.id is null then
        raise exception '用户不存在或尚未设置用户名';
    end if;
    if v_profile.id = auth.uid () then
        raise exception '不能撤销自己的管理员权限';
    end if;

    -- 仅授出者可收回自己的授权边
    if not exists (
        select 1 from public.admin_grants
        where granted_by = auth.uid () and grantee_id = v_profile.id
    ) then
        raise exception '无权撤销该用户：仅其授权者（您）可撤销这份授权';
    end if;

    delete from public.admin_grants
    where granted_by = auth.uid () and grantee_id = v_profile.id;

    -- 被撤者仍持有其他管理员授予的权限 → 身份保留，仅收回自己这份
    if exists (select 1 from public.admin_grants where grantee_id = v_profile.id) then
        return '已收回您授予 ' || v_profile.username || ' 的管理员权限（其仍持有其他管理员授予的权限）';
    end if;

    -- 无其他入边 → 不动点级联：收回其授出的整棵子树
    v_doomed := array[v_profile.id];
    loop
        v_changed := false;
        for v_row in
            select distinct g.grantee_id
            from public.admin_grants g
            where g.granted_by = any (v_doomed)
              and not (g.grantee_id = any (v_doomed))
              and not exists (
                  select 1 from public.admin_grants o
                  where o.grantee_id = g.grantee_id
                    and not (o.granted_by = any (v_doomed))
              )
        loop
            v_doomed := v_doomed || v_row.grantee_id;
            v_changed := true;
        end loop;
        exit when not v_changed;
    end loop;

    delete from public.admin_grants
    where grantee_id = any (v_doomed) or granted_by = any (v_doomed);

    update public.profiles
    set is_admin = false
    where id = any (v_doomed);

    get diagnostics v_count = row_count;
    if v_count > 1 then
        return '已收回 ' || v_profile.username || ' 及其授出的 ' || (v_count - 1) || ' 位管理员的管理员权限';
    end if;
    return '已收回 ' || v_profile.username || ' 的管理员权限';
end;
$$;

grant execute on function public.grant_admin (text) to authenticated;
grant execute on function public.revoke_admin (text) to authenticated;

-- 存量管理员回填：现有 is_admin=true 的用户生成根授权边
insert into public.admin_grants (grantee_id, granted_by)
select id, null
from public.profiles
where is_admin
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- 10. 批量删除（0004）
-- 本人或管理员删除某用户全部工程（保护工程豁免；评论功能已下线）。
-- ─────────────────────────────────────────────────────────────
create or replace function public.delete_user_content (p_target uuid)
    returns table (deleted_projects int)
    language plpgsql
    security definer
    set search_path = public
as $$
declare
    v_projects int := 0;
begin
    if auth.uid () is null then
        raise exception '请先登录';
    end if;
    if auth.uid () <> p_target and not public.is_admin () then
        raise exception '无权限：仅本人或管理员可执行该操作';
    end if;

    delete from public.projects where author_id = p_target and protected = false;
    get diagnostics v_projects = row_count;

    return query select v_projects;
end;
$$;

grant execute on function public.delete_user_content (uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 使用说明
--  1. 全新库：本文件一次性执行。
--  2. 设置首个管理员（执行后立即生效）：
--     update public.profiles p set is_admin = true
--     from auth.users u where u.id = p.id and u.email = 'you@example.com';
--     需要其成为根管理员（不可被页面撤销）时，执行回填：
--     insert into public.admin_grants (grantee_id, granted_by)
--     select id, null from public.profiles
--     where is_admin and id not in (select grantee_id from public.admin_grants)
--     on conflict do nothing;
--  3. Buff 集：仅管理员可编辑；快照创建/对比/恢复/删除仅管理员。
-- ═══════════════════════════════════════════════════════════════
