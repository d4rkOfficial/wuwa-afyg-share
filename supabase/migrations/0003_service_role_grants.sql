-- 椰果工坊 · service_role 权限
-- 匿名公开 API（POST /api/public/projects）使用 service_role 写入，
-- service_role 自动绕过 RLS，但表级权限仍需显式授予（已关闭"自动暴露新表"）。

grant select, insert, update, delete on public.projects to service_role;
grant select, insert, delete on public.likes to service_role;
grant execute on function public.bump_counter (uuid, text) to service_role;
