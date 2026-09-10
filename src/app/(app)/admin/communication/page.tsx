import type { Metadata } from 'next'
import CommunicationPanel from '@/components/admin/CommunicationPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Communication — ONA Field',
  description:
    "Envoyer des messages individuels aux observateurs, analystes ou adresses externes.",
}

export default function AdminCommunicationPage() {
  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <CommunicationPanel />
    </div>
  )
}
