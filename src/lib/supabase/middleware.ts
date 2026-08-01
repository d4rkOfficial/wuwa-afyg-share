import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        return NextResponse.next({ request })
    }
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                }
            }
        }
    )

    const {
        data: { user }
    } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname

    // 首次登录强制设置用户名：登录后所有页面重定向到 /setup-username
    if (
        user &&
        !path.startsWith('/api') &&
        !path.startsWith('/setup-username') &&
        !path.startsWith('/login') &&
        !path.startsWith('/auth/')
    ) {
        const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()
        if (!profile) {
            const url = request.nextUrl.clone()
            url.pathname = '/setup-username'
            url.search = ''
            url.searchParams.set('redirect', path + request.nextUrl.search)
            return NextResponse.redirect(url)
        }
    }

    const isProtected = path.startsWith('/upload') || path.startsWith('/me')

    if (!user && isProtected) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('redirect', path + request.nextUrl.search)
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}
