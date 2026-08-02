-- 椰果工坊 · 管理员权限（Buff 集维护）
-- 说明：管理员身份通过 public.profiles.is_admin 标记；编辑器/后续 DeepSeek 写入路径
-- 均以此为准。公开读页与工具下载端不受影响（仍为只读）。
--
-- 开启管理员（把某账号置为管理员，运行后重新登录生效）：
--   update public.profiles set is_admin = true where email = 'you@example.com';
--   或者按用户 id：
--   update public.profiles set is_admin = true where id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
--
-- 示例：把邮箱 d4rk6666@outlook.com 的用户设为管理员
--   update public.profiles p set is_admin = true
--   from auth.users u where u.id = p.id and u.email = 'd4rk6666@outlook.com';

-- ── 1. profiles 增加管理员标记 ─────────────────────────────
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- ── 2. 管理员判定函数（security definer，供 RLS 引用）────────
create or replace function public.is_admin ()
    returns boolean
    language sql
    security definer
    set search_path = public
    as $$
    select coalesce ((select is_admin from public.profiles where id = auth.uid ()), false);
$$;

-- ── 3. buff_sets 管理员写策略（仅管理员，公开只读策略不变）──
drop policy if exists buff_sets_admin_all on public.buff_sets;
create policy buff_sets_admin_all on public.buff_sets
    for all to authenticated
    using (public.is_admin ())
    with check (public.is_admin ());

-- ── 4. 表级授权 ─────────────────────────────────────────────
grant insert, update, delete on public.buff_sets to authenticated;
grant execute on function public.is_admin () to authenticated;
grant update (is_admin) on public.profiles to service_role;

-- ── 5. 示例数据（可选，供编辑器测试）──────────────────────
-- 以下 INSERT 走管理员权限后可插入；此处给出 format 示例（实际授权由 RLS 控制）。
-- insert into public.buff_sets (entity_type, entity_name, buff_name, buff_set)
-- values
--   ('character', '今汐', '固有·潮汐补偿', '[]'::jsonb),
--   ('weapon',   '极光',  '浮光掠影',     '[{"zoneId":"atkPct","value":12}]'::jsonb);