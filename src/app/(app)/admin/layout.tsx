import type { ReactNode } from 'react'
import AppShell from '@/components/app/AppShell'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell allowed={['ADMIN']}>
      {children}
    </AppShell>
  )
}
