import { Suspense } from 'react'
import type { Metadata } from 'next'
import { isDemoLoginAvailable } from '@/app/actions/authActions'
import LoginForm from './LoginForm'

export const metadata: Metadata = {
  title: 'Connexion administrateur',
  description:
    'Espace sécurisé Vision Analytics : identifiez-vous pour administrer les projets et consulter les analyses scientifiques.',
}

export default async function LoginPage() {
  const demoAvailable = await isDemoLoginAvailable()

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <Suspense fallback={null}>
        <LoginForm demoAvailable={demoAvailable} />
      </Suspense>
    </div>
  )
}
