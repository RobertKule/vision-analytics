'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Mail, Plus, Send, Users } from 'lucide-react'
import {
  listCommunicationTemplates,
  listCommunications,
  sendCommunication,
  type CommunicationRow,
} from '@/app/actions/communicationActions'
import { listUsers } from '@/app/actions/userAdminActions'
import type { CommunicationTemplate } from '@/lib/communicationTemplates'
import type { UserAdminDto } from '@/lib/types'

/**
 * MODULE « COMMUNICATION » (ADMIN).
 *
 * Envoi d'un message libre / à partir d'un template vers des utilisateurs ONA Field
 * et/ou des adresses externes. Un email individuel par destinataire. Historique +
 * résultat d'envoi (succès/échecs) affichés. Aucun droit d'accès n'est accordé.
 */

export default function CommunicationPanel() {
  const [templates, setTemplates] = useState<CommunicationTemplate[]>([])
  const [users, setUsers] = useState<UserAdminDto[]>([])
  const [history, setHistory] = useState<CommunicationRow[]>([])

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [externalInput, setExternalInput] = useState('')
  const [externalEmails, setExternalEmails] = useState<string[]>([])

  const [templateId, setTemplateId] = useState<string>('free')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const [sending, setSending] = useState(false)

  useEffect(() => {
    void listCommunicationTemplates().then(setTemplates)
    void listUsers().then(setUsers)
    void listCommunications().then(setHistory)
  }, [])

  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const template = templates.find((t) => t.id === id)
    if (template) {
      setSubject(template.subject)
      setBody(template.body)
    }
  }

  const addExternalEmail = () => {
    const value = externalInput.trim()
    if (!value) return
    if (externalEmails.includes(value.toLowerCase())) {
      setExternalInput('')
      return
    }
    setExternalEmails((prev) => [...prev, value])
    setExternalInput('')
  }

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const selectedRecipientLabels = useMemo(() => {
    const internal = users
      .filter((u) => selectedUserIds.includes(u.id))
      .map((u) => u.username?.trim() || u.email)
    return [...internal, ...externalEmails]
  }, [users, selectedUserIds, externalEmails])

  const handleSend = async () => {
    if (selectedRecipientLabels.length === 0) {
      toast.error('Aucun destinataire')
      return
    }
    if (!subject.trim()) {
      toast.error('L’objet est requis')
      return
    }
    setSending(true)
    try {
      const result = await sendCommunication({
        recipientUserIds: selectedUserIds,
        recipientEmails: externalEmails,
        templateId: templateId === 'free' ? undefined : templateId,
        subject,
        body,
      })
      if (!result.ok) {
        toast.error('Envoi impossible', { description: result.error })
        return
      }
      toast.success('Envoi terminé', {
        description: `${result.successCount} envoyé(s) · ${result.failureCount} échec(s)${
          result.invalid.length > 0 ? ` · ${result.invalid.length} invalide(s)` : ''
        }`,
      })
      void listCommunications().then(setHistory)
    } catch (error) {
      console.error('[communication] envoi impossible', error)
      toast.error('Envoi impossible')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700 dark:text-gold-400">
          Administration
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
          Communication
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Envoyer des messages individuels aux observateurs, analystes ou adresses externes.
        </p>
      </header>

      {/* ——— Destinataires ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
        <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
          <Users aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
          Destinataires
        </h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => toggleUser(user.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                selectedUserIds.includes(user.id)
                  ? 'border-gold-500 bg-gold-500/15 text-gold-800 dark:text-gold-200'
                  : 'border-zinc-200 text-zinc-600 hover:border-gold-500/50 dark:border-white/15 dark:text-zinc-300'
              }`}
            >
              {user.username?.trim() || user.email}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="email"
            value={externalInput}
            onChange={(event) => setExternalInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addExternalEmail()
              }
            }}
            placeholder="Adresse email externe (ex. chercheur@universite.fr)"
            className="h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-800 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-200"
          />
          <button
            type="button"
            onClick={addExternalEmail}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-white/15 dark:text-zinc-200 dark:hover:bg-white/5"
          >
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>

        {selectedRecipientLabels.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              {selectedRecipientLabels.length} destinataire
              {selectedRecipientLabels.length > 1 ? 's' : ''} :
            </span>
            {selectedRecipientLabels.map((label) => (
              <span
                key={label}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {/* ——— Template + message ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-zinc-100">
            <Mail aria-hidden="true" className="h-4 w-4 text-gold-700 dark:text-gold-400" />
            Template
          </h2>
          <select
            value={templateId}
            onChange={(event) => applyTemplate(event.target.value)}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-2 text-sm text-zinc-700 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-200"
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </div>

        <label className="mt-4 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Objet
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-800 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-200"
          />
        </label>

        <label className="mt-4 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Message
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={10}
            className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-800 focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-200"
          />
        </label>

        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          Variables disponibles : {'{observerName}'} {'{recipientEmail}'} {'{projectName}'} {'{observationCount}'} {'{average}'} {'{completionRate}'} {'{message}'}. Une variable absente reste vide.
        </p>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-5 text-sm font-semibold text-milk transition-colors hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50 dark:bg-milk dark:text-ink dark:hover:bg-white/90"
          >
            <Send aria-hidden="true" className="h-4 w-4" />
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      </section>

      {/* ——— Historique ——— */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#161b22]">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">Historique</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Aucune communication envoyée.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 dark:divide-white/5">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-xs">
                <span className="text-zinc-400">{new Date(row.createdAt).toLocaleString('fr-FR')}</span>
                <span className="font-medium text-zinc-700 dark:text-zinc-300">{row.authorLabel}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-400">{row.subject}</span>
                <span className="text-zinc-500">
                  {row.recipientCount} destinataire{row.recipientCount > 1 ? 's' : ''} ·{' '}
                  <span className="font-semibold text-emerald-600">{row.successCount}</span> envoyé(s) ·{' '}
                  <span className={row.failureCount > 0 ? 'font-semibold text-clay-600' : ''}>
                    {row.failureCount}
                  </span>{' '}
                  échec(s)
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
