-- ═══════════════════════════════════════════════════════════════
-- 椰果工坊 · 全量初始化（合并原 0001~0012，单文件一次执行）
-- 说明：本文件按顺序包含：工程表/RLS、匿名分享、service_role、
--       过期清理、用户资料、移除点赞、工程压缩、Buff 集表、
--       管理员权限、Buff 元信息、权限调整。
-- 适用：全新数据库一次性执行；已按旧迁移初始化过的库请勿重跑。
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- [0001] 初始结构
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
    project_blob bytea,
    file_size    int not null default 0,
    published    boolean not null default true,
    expires_at   timestamptz,
    view_count   int not null default 0,
    clone_count  int not null default 0,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

create index if not exists projects_created_idx on public.projects (created_at desc);
create index if not exists projects_clones_idx on public.projects (clone_count desc);
create index if not exists projects_expires_idx on public.projects (expires_at);
create index if not exists projects_tags_idx on public.projects using gin (tags);

-- ─────────────────────────────────────────────────────────────
-- [0006] 移除点赞机制（点赞业务已下线）
-- ─────────────────────────────────────────────────────────────
drop table if exists public.likes;

-- ─────────────────────────────────────────────────────────────
-- [0001] 工程 RLS
-- ─────────────────────────────────────────────────────────────
alter table public.projects enable row level security;

-- 公开只读可见工程（未过期 + 已发布）
create policy projects_public_read on public.projects
    for select
    using (published = true and (expires_at is null or expires_at > now()));

-- 作者本人全权限（含已过期/未发布的工程）
create policy projects_author_all on public.projects
    for all to authenticated
    using (auth.uid () = author_id)
    with check (auth.uid () = author_id);

-- ─────────────────────────────────────────────────────────────
-- [0001] 计数器 RPC（匿名可调用，避免绕过 RLS 直接 UPDATE）
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

grant execute on function public.bump_counter (uuid, text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- [0002] 匿名分享支持（公开 API 匿名上传，author_id 可空）
-- ─────────────────────────────────────────────────────────────
alter table public.projects
    alter column author_id drop not null;

-- ─────────────────────────────────────────────────────────────
-- [0003] service_role 权限（公开 API POST /api/public/projects 写入）
-- ─────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.projects to service_role;
grant execute on function public.bump_counter (uuid, text) to service_role;

-- ─────────────────────────────────────────────────────────────
-- [0004] 自动清理过期工程（pg_cron，每 5 分钟）
-- ─────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

-- 一次性清掉存量过期行
delete from public.projects
where expires_at is not null and expires_at < now();

-- 注册定时任务（幂等，已存在则跳过）
do $$
begin
    if not exists (select 1 from cron.job where jobname = 'cleanup-expired-projects') then
        perform cron.schedule(
            'cleanup-expired-projects',
            '*/5 * * * *',
            $cmd$ delete from public.projects where expires_at is not null and expires_at < now() $cmd$
        );
    end if;
end $$;

-- ─────────────────────────────────────────────────────────────
-- [0001] 数据 API 访问权限（已关闭“自动暴露新表”，需显式授权）
-- ─────────────────────────────────────────────────────────────
grant select on public.projects to anon, authenticated;
grant select, insert, update, delete on public.projects to authenticated;

-- ─────────────────────────────────────────────────────────────
-- [0005] 用户资料（用户名）
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

-- ── profiles RLS ────────────────────────────────────────────
alter table public.profiles enable row level security;

-- 用户名公开可见（供列表展示与 proxy 中间件查询）
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

-- ── profiles 表级权限 ───────────────────────────────────────
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;

-- ─────────────────────────────────────────────────────────────
-- [0010] 管理员判定函数（security definer，供 RLS 引用）
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_admin ()
    returns boolean
    language sql
    security definer
    set search_path = public
    as $$
    select coalesce ((select is_admin from public.profiles where id = auth.uid ()), false);
$$;

grant execute on function public.is_admin () to authenticated;
grant update (is_admin) on public.profiles to service_role;

-- ─────────────────────────────────────────────────────────────
-- [0007] 工程压缩存储（project_blob）
-- ─────────────────────────────────────────────────────────────
alter table public.projects
    add column if not exists project_blob bytea;

comment on column public.projects.project_blob is 'brotli 压缩后的完整工程文件（原始 ≤5MB，压缩后 ≤0.5MB）';

-- ─────────────────────────────────────────────────────────────
-- [0008] 工程压缩存储收尾（删除 project_json，project_blob 非空）
-- ─────────────────────────────────────────────────────────────
alter table public.projects
    drop column if exists project_json;

alter table public.projects
    alter column project_blob set not null;

-- ─────────────────────────────────────────────────────────────
-- [0009] Buff 集数据表
-- 游戏内实体（角色/武器/首位声骸/套装件数）的固定 buff 数值，
-- 由维护方（SQL / DeepSeek）写入，前端与工具侧读取。
-- ─────────────────────────────────────────────────────────────
create table if not exists public.buff_sets (
    entity_type text not null,
    entity_name text not null,
    buff_name   text not null,
    buff_set    jsonb not null,
    scope       text not null default 'team',
    exclusive   boolean not null default false,
    primary key (entity_type, entity_name, buff_name),
    check (entity_type in ('character', 'weapon', 'echo', '1set', '2set', '3set', '4set', '5set')),
    check (scope in ('self', 'self_except', 'team', 'effect_only'))
);

alter table public.buff_sets enable row level security;

-- 公开只读
create policy buff_sets_public_read on public.buff_sets
    for select
    using (true);

-- 登录用户可编辑（公开读策略不变）
drop policy if exists buff_sets_admin_all on public.buff_sets;
drop policy if exists buff_sets_authenticated_all on public.buff_sets;
create policy buff_sets_authenticated_all on public.buff_sets
    for all to authenticated
    using (true)
    with check (true);

-- ── buff_sets 表级权限 ──────────────────────────────────────
grant select on public.buff_sets to anon, authenticated;
grant insert, update, delete on public.buff_sets to authenticated;

-- ─────────────────────────────────────────────────────────────
-- [0012] 工程管理员策略（管理员可管理任意工程：改名/过期/删除）
-- ─────────────────────────────────────────────────────────────
drop policy if exists projects_admin_all on public.projects;
create policy projects_admin_all on public.projects
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

-- ═══════════════════════════════════════════════════════════════
-- 使用说明
--  1. 全新库：本文件一次性执行。
--  2. 设为管理员（执行后重新登录生效）：
--     update public.profiles p set is_admin = true
--     from auth.users u where u.id = p.id and u.email = 'you@example.com';
--  3. buff_sets 写入：登录用户即可编辑（含非管理员，用于测试）；
--     站点侧"保存"按钮仅管理员可用，非管理员仅可测试生成。
-- ═══════════════════════════════════════════════════════════════
