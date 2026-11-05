'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Alert } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  InboxIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SpinnerIcon,
  TrashIcon,
} from '@/components/ui/icons'
import { Modal } from '@/components/ui/modal'
import {
  SUPABASE_SETUP_MESSAGE,
  formatDate,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
  rowActionClass,
  rowDangerActionClass,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { createClient } from '@/utils/supabase/client'

export type PartyKind = 'clients' | 'vendors'

type PartyConfig = {
  table: 'clients' | 'vendors'
  title: string
  singular: string
  description: string
  nameField: 'company_name' | 'vendor_name'
  nameLabel: string
  namePlaceholder: string
  hasContactPerson: boolean
}

const PARTY_CONFIG: Record<PartyKind, PartyConfig> = {
  clients: {
    table: 'clients',
    title: 'Clients',
    singular: 'client',
    description:
      'Maintain the organisations that raise article requests and receive invoices.',
    nameField: 'company_name',
    nameLabel: 'Company name',
    namePlaceholder: 'e.g. Maitree Research Pvt. Ltd.',
    hasContactPerson: false,
  },
  vendors: {
    table: 'vendors',
    title: 'Vendors',
    singular: 'vendor',
    description:
      'Maintain the suppliers and service providers used to fulfil article requests.',
    nameField: 'vendor_name',
    nameLabel: 'Vendor name',
    namePlaceholder: 'e.g. Sharma Scientific Supplies',
    hasContactPerson: true,
  },
}

type PartyRow = {
  id: string
  company_name?: string | null
  vendor_name?: string | null
  contact_person?: string | null
  email: string | null
  phone: string | null
  gstin: string | null
  created_at: string | null
}

type PartyFormState = {
  name: string
  contact_person: string
  email: string
  phone: string
  gstin: string
}

type DialogState = { mode: 'create' } | { mode: 'edit'; row: PartyRow }

const EMPTY_FORM: PartyFormState = {
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  gstin: '',
}

export function PartyMasterManager({ kind }: { kind: PartyKind }) {
  const config = PARTY_CONFIG[kind]

  const [rows, setRows] = useState<PartyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [form, setForm] = useState<PartyFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<PartyRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadRows = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(true)
      }
      setLoadError(null)

      if (!hasSupabaseEnv()) {
        setLoadError(SUPABASE_SETUP_MESSAGE)
        setLoading(false)
        return
      }

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from(config.table)
          .select('*')
          .order(config.nameField, { ascending: true })

        if (error) {
          throw error
        }

        setRows((data ?? []) as PartyRow[])
      } catch (error) {
        setLoadError(getErrorMessage(error, `Unable to load ${config.title.toLowerCase()}.`))
      } finally {
        if (!options?.silent) {
          setLoading(false)
        }
      }
    },
    [config.nameField, config.table, config.title]
  )

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase()

    if (!term) {
      return rows
    }

    return rows.filter((row) =>
      [
        getPartyName(row, config.nameField),
        row.contact_person ?? '',
        row.email ?? '',
        row.phone ?? '',
        row.gstin ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [config.nameField, query, rows])

  const closeDialog = useCallback(() => {
    setDialog(null)
    setFormError(null)
  }, [])

  function openCreateDialog() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setDialog({ mode: 'create' })
  }

  function openEditDialog(row: PartyRow) {
    setForm({
      name: getPartyName(row, config.nameField),
      contact_person: row.contact_person ?? '',
      email: row.email ?? '',
      phone: row.phone ?? '',
      gstin: row.gstin ?? '',
    })
    setFormError(null)
    setDialog({ mode: 'edit', row })
  }

  function updateForm<K extends keyof PartyFormState>(key: K, value: PartyFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!dialog) {
      return
    }

    const name = form.name.trim()

    if (!name) {
      setFormError(`${config.nameLabel} is required.`)
      return
    }

    if (!hasSupabaseEnv()) {
      setFormError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setFormError(null)

    const payload: Record<string, string | null> = {
      [config.nameField]: name,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      gstin: form.gstin.trim() ? form.gstin.trim().toUpperCase() : null,
    }

    if (config.hasContactPerson) {
      payload.contact_person = form.contact_person.trim() || null
    }

    try {
      const supabase = createClient()

      if (dialog.mode === 'edit') {
        const { error } = await supabase
          .from(config.table)
          .update(payload)
          .eq('id', dialog.row.id)

        if (error) {
          throw error
        }
      } else {
        const { error } = await supabase.from(config.table).insert(payload)

        if (error) {
          throw error
        }
      }

      setDialog(null)
      setNotice({
        tone: 'success',
        message:
          dialog.mode === 'edit'
            ? `“${name}” was updated.`
            : `“${name}” was added.`,
      })
      await loadRows({ silent: true })
    } catch (error) {
      setFormError(getErrorMessage(error, `Unable to save the ${config.singular}.`))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return
    }

    if (!hasSupabaseEnv()) {
      setDeleteError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setDeleting(true)
    setDeleteError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from(config.table)
        .delete()
        .eq('id', deleteTarget.id)

      if (error) {
        throw error
      }

      setNotice({
        tone: 'success',
        message: `“${getPartyName(deleteTarget, config.nameField)}” was deleted.`,
      })
      setDeleteTarget(null)
      await loadRows({ silent: true })
    } catch (error) {
      setDeleteError(getErrorMessage(error, `Unable to delete the ${config.singular}.`))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300">
            Masters
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
            {config.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">{config.description}</p>
        </div>

        <button type="button" onClick={openCreateDialog} className={primaryButtonClass}>
          <PlusIcon className="h-4 w-4" />
          Add {config.singular}
        </button>
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${config.title.toLowerCase()}`}
              aria-label={`Search ${config.title.toLowerCase()}`}
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-xs text-slate-400">
              {filteredRows.length} of {rows.length}{' '}
              {rows.length === 1 ? config.singular : config.title.toLowerCase()}
            </p>
            <button
              type="button"
              onClick={() => void loadRows()}
              disabled={loading}
              className={`${secondaryButtonClass} px-2.5 py-1.5`}
            >
              {loading ? (
                <SpinnerIcon className="h-4 w-4" />
              ) : (
                <RefreshIcon className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {loadError && rows.length > 0 && (
          <div className="border-b border-white/10 px-4 py-3">
            <Alert tone="error" onDismiss={() => setLoadError(null)}>
              {loadError}
            </Alert>
          </div>
        )}

        {loading ? (
          <PartyTableSkeleton columns={config.hasContactPerson ? 7 : 6} />
        ) : loadError && rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-rose-300">Could not load {config.title.toLowerCase()}</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-400">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadRows()}
              className={`${secondaryButtonClass} mt-4`}
            >
              <RefreshIcon className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <InboxIcon className="mx-auto h-10 w-10 text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-100">
              {rows.length === 0 ? `No ${config.title.toLowerCase()} yet` : 'No matching records'}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {rows.length === 0
                ? `Add your first ${config.singular} to get started.`
                : `Nothing matches “${query.trim()}”. Try a different search.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <caption className="sr-only">{config.title} records</caption>
              <thead className="bg-white/[0.04] text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    {config.nameLabel}
                  </th>
                  {config.hasContactPerson && (
                    <th scope="col" className="px-4 py-3">
                      Contact person
                    </th>
                  )}
                  <th scope="col" className="px-4 py-3">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Phone
                  </th>
                  <th scope="col" className="px-4 py-3">
                    GSTIN
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRows.map((row) => {
                  const name = getPartyName(row, config.nameField)

                  return (
                    <tr key={row.id} className="transition-colors hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-slate-100">{name}</td>
                      {config.hasContactPerson && (
                        <td className="px-4 py-3 text-slate-400">
                          {row.contact_person || '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-slate-400">
                        {row.email ? (
                          <a
                            href={`mailto:${row.email}`}
                            className="text-emerald-300 hover:underline"
                          >
                            {row.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                        {row.phone ? (
                          <a href={`tel:${row.phone}`} className="hover:underline">
                            {row.phone}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {row.gstin || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEditDialog(row)}
                            className={rowActionClass}
                            aria-label={`Edit ${name}`}
                          >
                            <PencilIcon className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null)
                              setDeleteTarget(row)
                            }}
                            className={rowDangerActionClass}
                            aria-label={`Delete ${name}`}
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={dialog !== null}
        onClose={closeDialog}
        title={`${dialog?.mode === 'edit' ? 'Edit' : 'New'} ${config.singular}`}
        description={
          dialog?.mode === 'edit'
            ? `Update the details for this ${config.singular}.`
            : `Add a ${config.singular} to this master.`
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="party-name" className={labelClass}>
                {config.nameLabel} <span className="text-rose-400">*</span>
              </label>
              <input
                id="party-name"
                value={form.name}
                onChange={(event) => updateForm('name', event.target.value)}
                required
                maxLength={120}
                placeholder={config.namePlaceholder}
                autoFocus
                className={inputClass}
              />
            </div>

            {config.hasContactPerson && (
              <div className="sm:col-span-2">
                <label htmlFor="party-contact" className={labelClass}>
                  Contact person
                </label>
                <input
                  id="party-contact"
                  value={form.contact_person}
                  onChange={(event) => updateForm('contact_person', event.target.value)}
                  maxLength={120}
                  placeholder="e.g. Dr. R. Sharma"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label htmlFor="party-email" className={labelClass}>
                Email
              </label>
              <input
                id="party-email"
                type="email"
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                maxLength={160}
                placeholder="name@example.com"
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="party-phone" className={labelClass}>
                Phone
              </label>
              <input
                id="party-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => updateForm('phone', event.target.value)}
                maxLength={30}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                className={inputClass}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="party-gstin" className={labelClass}>
                GSTIN
              </label>
              <input
                id="party-gstin"
                value={form.gstin}
                onChange={(event) => updateForm('gstin', event.target.value.toUpperCase())}
                maxLength={15}
                placeholder="22AAAAA0000A1Z5"
                autoComplete="off"
                className={`${inputClass} font-mono uppercase`}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={closeDialog}
              disabled={saving}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving && <SpinnerIcon className="h-4 w-4" />}
              {saving
                ? 'Saving…'
                : dialog?.mode === 'edit'
                  ? 'Save changes'
                  : `Add ${config.singular}`}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget ? getPartyName(deleteTarget, config.nameField) : config.singular}”?`}
        message={`This permanently removes the ${config.singular}. If existing records reference it, the database will reject the delete.`}
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

function getPartyName(row: PartyRow, nameField: PartyConfig['nameField']) {
  return (nameField === 'company_name' ? row.company_name : row.vendor_name) ?? ''
}

function PartyTableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="divide-y divide-white/5" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="grid gap-4 px-4 py-4"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <div
              key={columnIndex}
              className="h-4 animate-pulse rounded bg-white/5"
            />
          ))}
        </div>
      ))}
    </div>
  )
}
