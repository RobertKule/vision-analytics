import { NextResponse, type NextRequest } from 'next/server'
import { parseSessionToken, SESSION_COOKIE_NAME, type Session } from '@/lib/session'
import { homeForRole } from '@/lib/navigation'

/**
 * Proxy (ex-middleware, convention Next.js 16) — garde d'accès multi-rôles.
 *
 * Règles :
 *  - /admin/*      : réservé au rôle ADMIN.
 *  - /analyst/*    : réservé à ANALYST et ADMIN.
 *  - /dashboard/*  : tout utilisateur connecté (OBSERVER, ANALYST, ADMIN).
 *  - /login /register : redirigés vers l'espace du rôle une fois connecté.
 *
 * La session est vérifiée côté Proxy en lecture seule (cookies signés) ;
 * les Server Actions appliquent leurs propres gardes côté serveur.
 */

function isIn(pathname: string, segment: string): boolean {
  return pathname === segment || pathname.startsWith(`${segment}/`)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session: Session | null = await parseSessionToken(token)

  const isAdminArea = isIn(pathname, '/admin')
  const isAnalystArea = isIn(pathname, '/analyst')
  const isDashboardArea = isIn(pathname, '/dashboard')
  const isAuthPage = pathname === '/login' || pathname === '/register'
  const isProtectedArea = isAdminArea || isAnalystArea || isDashboardArea

  // Non connecté → on exige une connexion pour les zones protégées.
  if (!session) {
    if (isProtectedArea) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.search = ''
      loginUrl.searchParams.set('from', pathname)
      return NextResponse.redirect(loginUrl)
    }
    return undefined
  }

  // Connecté → contrôle du rôle sur les zones restreintes.
  if (isAdminArea && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL(homeForRole(session.role), request.url))
  }
  if (isAnalystArea && session.role !== 'ANALYST' && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL(homeForRole(session.role), request.url))
  }

  // Déjà connecté → jamais la peine de revoir /login ou /register.
  if (isAuthPage) {
    return NextResponse.redirect(new URL(homeForRole(session.role), request.url))
  }
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/analyst/:path*',
    '/dashboard/:path*',
    '/login',
    '/register',
  ],
}
