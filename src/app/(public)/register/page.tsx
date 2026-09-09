import type { Metadata } from 'next'
import { getLocale } from '@/lib/i18n-server'
import { getDictionary } from '@/lib/i18n'
import RegisterForm from './RegisterForm'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale()
  return {
    title: locale === 'en' ? 'Create an account' : 'Créer un compte',
    description:
      locale === 'en'
        ? 'Request an analyst account on ONA Field. An administrator validates each request.'
        : 'Demandez un compte analyste sur ONA Field. Un administrateur valide chaque demande.',
  }
}

export default async function RegisterPage() {
  const locale = await getLocale()
  const d = getDictionary(locale)

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12 sm:px-6">
      <RegisterForm locale={locale} t={d.auth} />
    </div>
  )
}
