export default function SetupNotice() {
    return (
        <div className="mx-auto max-w-lg rounded-xl border border-(--card-border) bg-(--card) p-8 text-center">
            <p className="mb-2 text-lg font-semibold">服务尚未配置</p>
            <p className="text-sm text-(--muted)">
                请在项目根目录创建 <code className="rounded bg-(--card-hover) px-1.5 py-0.5">.env.local</code>{' '}
                并填入 Supabase 凭据（参考 .env.example），然后执行
                <code className="mx-1 rounded bg-(--card-hover) px-1.5 py-0.5">supabase/migrations/0001_init.sql</code>{' '}
                建表。
            </p>
        </div>
    )
}
