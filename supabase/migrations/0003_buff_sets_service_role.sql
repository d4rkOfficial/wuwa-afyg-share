-- ─────────────────────────────────────────────────────────────
-- [0003] buff_sets 授予 service_role 写权限
-- 供服务端脚本（批量改名等）用 service role key 直写 buff_sets；
-- 此前仅 authenticated 可写，service_role 缺失导致 403。
-- 幂等：授权语句重复执行无害
-- ─────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.buff_sets to service_role;
