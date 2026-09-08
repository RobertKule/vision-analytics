import type { ReactNode } from 'react'
import AppShell from '@/components/app/AppShell'

export default function AnalystLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell allowed={['ANALYST', 'ADMIN']}>
      {children}
    </AppShell>
  )
}
