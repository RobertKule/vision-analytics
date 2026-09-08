import type { ReactNode } from 'react'
import AppShell from '@/components/app/AppShell'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell allowed={['ADMIN', 'ANALYST', 'OBSERVER']}>
      {children}
    </AppShell>
  )
}
