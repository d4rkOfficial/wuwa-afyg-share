-- 首页角色筛选使用 JSONB 包含查询；GIN 索引避免随工程数量增长退化为全表扫描。
create index if not exists projects_team_preview_gin_idx
    on public.projects using gin (team_preview jsonb_path_ops);
