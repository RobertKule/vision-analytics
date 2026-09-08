'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FolderKanban,
  History,
  LayoutDashboard,
  Leaf,
  Settings,
  Users,
} from 'lucide-react'
import type { ShellText } from '@/lib/i18n'
import type { SessionRole } from '@/lib/session'

type AppSidebarProps = {
  role: SessionRole
  userName: string
  roleName: string
  t: ShellText
}

const MIN_WIDTH = 192
const MAX_WIDTH = 336
const DEFAULT_WIDTH = 264
const COLLAPSED_WIDTH = 72

export default function AppSidebar({ role, userName, roleName, t }: AppSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const dragging = useRef(false)

  // Restaure les préférences enregistrées juste après le premier rendu (hors
  // hydration) pour éviter tout désaccord serveur / client lors du rechargement.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const storedWidth = Number(window.localStorage.getItem('va-sidebar-width'))
        if (Number.isFinite(storedWidth) && storedWidth >= MIN_WIDTH && storedWidth <= MAX_WIDTH) {
          setWidth(storedWidth)
        }
        setCollapsed(window.localStorage.getItem('va-sidebar-collapsed') === '1')
      } catch {
        /* stockage indisponible */
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem('va-sidebar-width', String(width))
      window.localStorage.setItem('va-sidebar-collapsed', collapsed ? '1' : '0')
    } catch {
      /* stockage indisponible */
    }
  }, [width, collapsed])

  const beginDrag = (event: React.PointerEvent) => {
    event.preventDefault()
    dragging.current = true
    const startX = event.clientX
    const startWidth = width
    const onMove = (moveEvent: PointerEvent) => {
      if (!dragging.current) return
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)))
      setWidth(next)
      setCollapsed(false)
    }
    const onUp = () => {
      dragging.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const items: Array<{ key: string; label: string; href: string; icon: typeof LayoutDashboard; visible: boolean }> = [
    { key: 'overview', label: t.overview, href: '/dashboard', icon: LayoutDashboard, visible: true },
    { key: 'observe', label: t.observe, href: '/observe', icon: Eye, visible: true },
    {
      key: 'history',
      label: t.history,
      href: '/dashboard/history',
      icon: History,
      visible: role === 'OBSERVER',
    },
    {
      key: 'projects',
      label: t.projects,
      href: role === 'ADMIN' ? '/admin/projects' : '/analyst/projects',
      icon: FolderKanban,
      visible: role === 'ANALYST' || role === 'ADMIN',
    },
    {
      key: 'users',
      label: t.users,
      href: '/admin/users',
      icon: Users,
      visible: role === 'ADMIN',
    },
    {
      key: 'settings',
      label: t.settings,
      href: '/dashboard/settings',
      icon: Settings,
      visible: true,
    },
  ]

  const navItems = items.filter((item) => item.visible)
  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  const asideWidth = collapsed ? COLLAPSED_WIDTH : width

  return (
    <aside
      style={{ width: asideWidth }}
      className="relative flex shrink-0 flex-col border-r border-zinc-200 bg-white transition-[width] duration-200 dark:border-white/10 dark:bg-[#0d1117]"
    >
      {/* ——— Entête de marque ——— */}
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-100 px-3 dark:border-white/5">
        <Link
          href="/"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-forest-500 to-forest-700 text-white shadow-sm"
          aria-label="Vision Analytics"
        >
          <Leaf aria-hidden="true" className="h-4 w-4" />
        </Link>
        {!collapsed ? (
          <span className="truncate text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Vision Analytics
          </span>
        ) : null}
      </div>

      {/* ——— Navigation ——— */}
      <nav aria-label={t.openWorkspace} className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(item.href)
            const Icon = item.icon
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  title={item.label}
                  className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-forest-600 text-white shadow-sm'
                      : 'text-zinc-600 hover:bg-forest-50 hover:text-forest-700 dark:text-zinc-300 dark:hover:bg-forest-500/10 dark:hover:text-forest-400'
                  }`}
                >
                  <Icon
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-zinc-400 group-hover:text-forest-600 dark:group-hover:text-forest-400'}`}
                  />
                  {!collapsed ? <span className="truncate">{item.label}</span> : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* ——— Pied : profil + repli ——— */}
      <div className="border-t border-zinc-100 p-2 dark:border-white/5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? t.expand : t.collapse}
            title={collapsed ? t.expand : t.collapse}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          >
            {collapsed ? (
              <ChevronsRight aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ChevronsLeft aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
          {!collapsed ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-white/5">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-forest-500 to-forest-700 text-[10px] font-bold text-white">
                {(userName[0] ?? '?').toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">{userName}</p>
                <p className="truncate text-[10px] font-medium uppercase tracking-wide text-forest-600 dark:text-forest-400">
                  {roleName}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ——— Poignée de redimensionnement ——— */}
      {!collapsed ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t.resizeHint}
          title={t.resizeHint}
          onPointerDown={beginDrag}
          className="absolute -right-0.5 top-0 hidden h-full w-1.5 cursor-col-resize select-none items-center justify-center hover:bg-forest-500/20 md:flex"
        >
          <span className="h-8 w-0.5 rounded-full bg-zinc-200 transition-colors group-hover:bg-forest-400 dark:bg-white/10" />
        </div>
      ) : null}
    </aside>
  )
}
