'use client'

import { useEffect, useState } from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/app/actions/notificationActions'

type NotificationItem = {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

/**
 * CLOCHE DE NOTIFICATIONS IN-APP (Partie B/C).
 *
 * Un utilisateur ne consulte que SES notifications : la lecture et le marquage
 * sont re-vérifiés côté serveur (`listMyNotifications` / `markNotificationRead`
 * lisent la session, jamais un `userId` cible du client).
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])

  useEffect(() => {
    let cancelled = false
    void listMyNotifications().then((rows) => {
      if (!cancelled) setItems(rows)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const unread = items.filter((item) => !item.read).length

  const handleOpen = () => {
    setOpen((value) => !value)
  }

  const handleRead = async (id: string) => {
    const result = await markNotificationRead(id)
    if (result.ok) {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, read: true } : item)))
    }
  }

  const handleMarkAll = async () => {
    const result = await markAllNotificationsRead()
    if (result.ok) {
      setItems((prev) => prev.map((item) => ({ ...item, read: true })))
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
      >
        <Bell aria-hidden="true" className="h-4.5 w-4.5" />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-600 px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="menu"
            aria-label="Notifications"
            className="absolute right-0 top-full z-50 mt-2 w-80 origin-top-right rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-white/10 dark:bg-[#0d1117]"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-white/10">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Notifications</p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => void handleMarkAll()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gold-700 transition-colors hover:text-gold-800 dark:text-gold-400"
                >
                  <CheckCheck aria-hidden="true" className="h-3.5 w-3.5" />
                  Tout marquer comme lu
                </button>
              ) : null}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  Aucune notification.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-white/5">
                  {items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => !item.read && void handleRead(item.id)}
                        className={`w-full px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 ${
                          item.read ? 'opacity-70' : ''
                        }`}
                      >
                        <p className="flex items-center justify-between gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.title}
                          {!item.read ? (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-gold-600" />
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">{item.message}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
