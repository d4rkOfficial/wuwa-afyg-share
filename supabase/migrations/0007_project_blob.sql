-- 椰果工坊 · 工程压缩存储
-- 新增 project_blob：brotli 压缩后的完整工程二进制（bytea）。
-- project_json 保留到 backfill（scripts/migrate-project-blob.mjs）完成后再由 0008 删除。

alter table public.projects
    add column if not exists project_blob bytea;

comment on column public.projects.project_blob is 'brotli 压缩后的完整工程文件（原始 ≤5MB，压缩后 ≤0.5MB）';
