import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// service_role 仅限服务端使用（可绕过 RLS），用于匿名公开 API 写入
export function createServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    return createSupabaseClient(url, key, { auth: { persistSession: false } })
}
