import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/masters',
  '/article-requests',
  '/proforma-invoices',
  '/tax-invoices',
  '/payment-receipts',
]

const LOGIN_PATH = '/login'

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Next.js 16 replaced `middleware.ts` with `proxy.ts`. This runs before every
 * non-static request to refresh the Supabase session cookie and gate the
 * authenticated workspace routes.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    // Without credentials nothing can be authenticated. Send the workspace to
    // the login screen, which explains the missing configuration.
    if (isProtectedPath(pathname)) {
      return NextResponse.redirect(new URL(LOGIN_PATH, request.url))
    }

    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (pathname === LOGIN_PATH) {
    if (user) {
      return redirectWithCookies(request, response, '/dashboard')
    }

    return response
  }

  if (!user && isProtectedPath(pathname)) {
    return redirectWithCookies(request, response, LOGIN_PATH)
  }

  return response
}

function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string
): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ''

  const redirect = NextResponse.redirect(url)
  response.cookies.getAll().forEach(({ name, value, ...options }) => {
    redirect.cookies.set(name, value, options)
  })

  return redirect
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2)$).*)',
  ],
}
