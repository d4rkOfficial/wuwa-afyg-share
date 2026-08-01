-- 椰果工坊 · 用户资料（用户名）
-- 首次登录强制设置用户名；author_name 仍冗余存于 projects，改用户名时同步更新。

create table if not exists public.profiles (
    id         uuid primary key references auth.users (id) on delete cascade,
    username   text not null,
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

-- ── RLS ──────────────────────────────────────────────────
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

-- ── 表级权限 ─────────────────────────────────────────────
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
