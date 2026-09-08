import { Suspense } from 'react'
import type { Metadata } from 'next'
import { isDemoLoginAvailable } from '@/app/actions/authActions'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import LoginForm from './LoginForm'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'Sign in' : 'Connexion',
    description:
      locale === 'en'
        ? 'Researchers and analysts: sign in with your email or username.'
        : 'Chercheurs et analystes : connectez-vous avec votre email ou votre nom d’utilisateur.',
  }
}

export default async function LoginPage() {
  const [locale, demoAvailable] = await Promise.all([getLocale(), isDemoLoginAvailable()])
  const d = getDictionary(locale)

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <Suspense fallback={null}>
        <LoginForm
          locale={locale}
          t={d.auth}
          roleName={d.roles}
          demoAvailable={demoAvailable}
        />
      </Suspense>
    </div>
  )
}
