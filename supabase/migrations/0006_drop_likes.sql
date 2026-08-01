-- 椰果工坊 · 移除点赞机制
-- 点赞业务已下线，删除 likes 表（连同其策略、索引与表级授权一并移除）。

drop table if exists public.likes;
