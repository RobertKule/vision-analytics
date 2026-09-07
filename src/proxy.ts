import { NextResponse, type NextRequest } from 'next/server'
import { parseSessionToken, SESSION_COOKIE_NAME } from '@/lib/session'

/**
 * Proxy (ex-middleware, convention Next.js 16) — garde d'accès à la zone admin.
 * - /admin/*   : redirige vers /login si aucune session administrateur valide.
 * - /login     : redirige vers /admin/projects si déjà authentifié.
 *
 * La session est vérifiée côté Proxy en lecture seule (cookies signés) ;
 * les Server Actions appliquent leurs propres gardes côté serveur.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = await parseSessionToken(token)

  const isProtected = pathname.startsWith('/admin')
  const isLoginPage = pathname.startsWith('/login')

  if (isProtected && !session) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (isLoginPage && session) {
    return NextResponse.redirect(new URL('/admin/projects', request.url))
  }
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
}
