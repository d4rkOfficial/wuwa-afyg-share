export default function SetupNotice() {
    return (
        <div className="wk" style={{ display: 'flex', justifyContent: 'center', paddingTop: 24 }}>
            <div className="wk-card wk-card-pad" style={{ maxWidth: 480, textAlign: 'center' }}>
                <p style={{ fontSize: 'var(--wk-t-lead)', fontWeight: 600 }}>服务尚未配置</p>
                <p className="wk-meta" style={{ marginTop: 8, lineHeight: 1.75 }}>
                    请在项目根目录创建 <code className="wk-code">.env.local</code> 并填入 Supabase 凭据（参考 .env.example），
                    然后执行 <code className="wk-code">supabase/migrations/init.sql</code> 建表。
                </p>
            </div>
        </div>
    )
}
