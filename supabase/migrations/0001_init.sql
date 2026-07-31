-- 椰果工坊 · 初始结构

-- ── projects ──────────────────────────────────────────────
create table if not exists public.projects (
    id           uuid primary key default gen_random_uuid(),
    code         text not null unique,
    author_id    uuid not null references auth.users (id) on delete cascade,
    author_name  text not null default '匿名',
    title        text not null,
    description  text not null default '',
    tags         text[] not null default '{}',
    game_version text,
    team_preview jsonb,
    project_json jsonb not null,
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

-- ── likes ────────────────────────────────────────────────
create table if not exists public.likes (
    project_id uuid not null references public.projects (id) on delete cascade,
    user_id    uuid not null references auth.users (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (project_id, user_id)
);

create index if not exists likes_user_idx on public.likes (user_id);

-- ── RLS ──────────────────────────────────────────────────
alter table public.projects enable row level security;
alter table public.likes enable row level security;

-- 公开只读可见工程（未过期 + 已发布）
create policy projects_public_read on public.projects
    for select
    using (published = true and (expires_at is null or expires_at > now()));

-- 作者本人全权限（含已过期/未发布的工程）
create policy projects_author_all on public.projects
    for all to authenticated
    using (auth.uid () = author_id)
    with check (auth.uid () = author_id);

create policy likes_public_read on public.likes
    for select
    using (true);

create policy likes_author_all on public.likes
    for all to authenticated
    using (auth.uid () = user_id)
    with check (auth.uid () = user_id);

-- ── 计数器 RPC（匿名可调用，避免绕过 RLS 直接 UPDATE）──────
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

-- ── 数据 API 访问权限（已关闭“自动暴露新表”，需显式授权）────
-- RLS 仍负责行级过滤，这里只放行语句入口
grant select on public.projects to anon, authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select on public.likes to anon, authenticated;
grant select, insert, delete on public.likes to authenticated;
