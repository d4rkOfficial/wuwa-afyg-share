-- 椰果工坊 · 工程压缩存储（收尾）
-- 在 0007 + backfill 之后执行：删除冗余 project_json，project_blob 转为非空。

alter table public.projects
    drop column if exists project_json;

alter table public.projects
    alter column project_blob set not null;
