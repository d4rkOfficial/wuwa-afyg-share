-- [0003] 公告表：工坊首页公告栏（公开读，管理员增删改）
create table if not exists public.announcements (
    id         uuid primary key default gen_random_uuid(),
    title      text not null default '',
    content    text not null,
    created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

-- 公开只读
drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read on public.announcements
    for select
    using (true);

-- 仅管理员可写
drop policy if exists announcements_admin_all on public.announcements;
create policy announcements_admin_all on public.announcements
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;
