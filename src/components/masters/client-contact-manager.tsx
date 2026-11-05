'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Contact, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'

import {
  SUPABASE_SETUP_MESSAGE,
  cardClass,
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
import { Alert } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import { SpinnerIcon } from '@/components/ui/icons'
import { createClient } from '@/utils/supabase/client'

type ClientRow = { id: string; company_name: string }
type DepartmentRow = { id: string; department_name: string; client_id: string | null }

type ContactRow = {
  id: string
  client_id: string | null
  department_id: string | null
  contact_name: string
  email: string | null
  phone: string | null
  created_at: string | null
}

type FormState = {
  client_id: string
  department_id: string
  contact_name: string
  email: string
  phone: string
}

type DialogState = { mode: 'create' } | { mode: 'edit'; row: ContactRow }

const EMPTY_FORM: FormState = {
  client_id: '',
  department_id: '',
  contact_name: '',
  email: '',
  phone: '',
}

export function ClientContactManager() {
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ContactRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const clientNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const client of clients) {
      map.set(client.id, client.company_name)
    }
    return map
  }, [clients])

  const departmentNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const department of departments) {
      map.set(department.id, department.department_name)
    }
    return map
  }, [departments])

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
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
      const [contactsResult, clientsResult, departmentsResult] = await Promise.all([
        supabase
          .from('client_contacts')
          .select('id, client_id, department_id, contact_name, email, phone, created_at')
          .order('contact_name', { ascending: true }),
        supabase.from('clients').select('id, company_name').order('company_name', { ascending: true }),
        supabase
          .from('departments')
          .select('id, department_name, client_id')
          .order('department_name', { ascending: true }),
      ])

      if (contactsResult.error) {
        throw contactsResult.error
      }

      if (clientsResult.error) {
        throw clientsResult.error
      }

      if (departmentsResult.error) {
        throw departmentsResult.error
      }

      setContacts((contactsResult.data ?? []) as ContactRow[])
      setClients((clientsResult.data ?? []) as ClientRow[])
      setDepartments((departmentsResult.data ?? []) as DepartmentRow[])
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load client contacts.'))
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // When the client filter changes, reset a department filter that no longer applies.
  useEffect(() => {
    if (!departmentFilter) {
      return
    }

    const department = departments.find((item) => item.id === departmentFilter)

    if (!department || (clientFilter && department.client_id !== clientFilter)) {
      setDepartmentFilter('')
    }
  }, [clientFilter, departmentFilter, departments])

  const filterDepartments = useMemo(() => {
    if (!clientFilter) {
      return departments
    }

    return departments.filter((department) => department.client_id === clientFilter)
  }, [clientFilter, departments])

  const formDepartments = useMemo(() => {
    if (!form.client_id) {
      return []
    }

    return departments.filter((department) => department.client_id === form.client_id)
  }, [departments, form.client_id])

  const filteredContacts = useMemo(() => {
    const term = query.trim().toLowerCase()

    return contacts.filter((contact) => {
      if (clientFilter && contact.client_id !== clientFilter) {
        return false
      }

      if (departmentFilter && contact.department_id !== departmentFilter) {
        return false
      }

      if (!term) {
        return true
      }

      return [
        contact.contact_name,
        contact.email ?? '',
        contact.phone ?? '',
        clientNames.get(contact.client_id ?? '') ?? '',
        departmentNames.get(contact.department_id ?? '') ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [clientFilter, clientNames, contacts, departmentFilter, departmentNames, query])

  function openCreateDialog() {
    setForm({ ...EMPTY_FORM, client_id: clients[0]?.id ?? '' })
    setFormError(null)
    setDialog({ mode: 'create' })
  }

  function openEditDialog(row: ContactRow) {
    setForm({
      client_id: row.client_id ?? '',
      department_id: row.department_id ?? '',
      contact_name: row.contact_name,
      email: row.email ?? '',
      phone: row.phone ?? '',
    })
    setFormError(null)
    setDialog({ mode: 'edit', row })
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleClientChange(clientId: string) {
    setForm((current) => {
      const department = departments.find((item) => item.id === current.department_id)
      const keepDepartment = department && department.client_id === clientId

      return {
        ...current,
        client_id: clientId,
        department_id: keepDepartment ? current.department_id : '',
      }
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!dialog) {
      return
    }

    const name = form.contact_name.trim()

    if (!name) {
      setFormError('Contact name is required.')
      return
    }

    if (!form.client_id) {
      setFormError('Select the client this contact belongs to.')
      return
    }

    if (!hasSupabaseEnv()) {
      setFormError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      client_id: form.client_id,
      department_id: form.department_id || null,
      contact_name: name,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
    }

    try {
      const supabase = createClient()

      if (dialog.mode === 'edit') {
        const { error } = await supabase
          .from('client_contacts')
          .update(payload)
          .eq('id', dialog.row.id)

        if (error) {
          throw error
        }
      } else {
        const { error } = await supabase.from('client_contacts').insert(payload)

        if (error) {
          throw error
        }
      }

      setDialog(null)
      setNotice({
        tone: 'success',
        message:
          dialog.mode === 'edit' ? `“${name}” was updated.` : `“${name}” was added.`,
      })
      await loadData({ silent: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Unable to save the contact.'))
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
        .from('client_contacts')
        .delete()
        .eq('id', deleteTarget.id)

      if (error) {
        throw error
      }

      setNotice({ tone: 'success', message: `“${deleteTarget.contact_name}” was deleted.` })
      setDeleteTarget(null)
      await loadData({ silent: true })
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'Unable to delete the contact.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Masters</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Client Contacts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Keep the day-to-day client team members on file so article requests and invoices reach
            the right person.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDialog}
          className={primaryButtonClass}
          disabled={loading || clients.length === 0}
        >
          <Plus className="h-4 w-4" />
          Add contact
        </button>
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      <div className={`overflow-hidden ${cardClass}`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email or phone"
              aria-label="Search client contacts"
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="contact-client-filter">
              Filter by client
            </label>
            <select
              id="contact-client-filter"
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className={`${inputClass} sm:w-48`}
            >
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company_name}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="contact-department-filter">
              Filter by department
            </label>
            <select
              id="contact-department-filter"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
              className={`${inputClass} sm:w-48`}
            >
              <option value="">All departments</option>
              {filterDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.department_name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className={`${secondaryButtonClass} px-2.5 py-2`}
            >
              {loading ? <SpinnerIcon className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {loadError && contacts.length > 0 && (
          <div className="border-b border-slate-200 px-4 py-3">
            <Alert tone="error" onDismiss={() => setLoadError(null)}>
              {loadError}
            </Alert>
          </div>
        )}

        {loading ? (
          <TableSkeleton />
        ) : loadError && contacts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-red-700">Could not load client contacts</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className={`${secondaryButtonClass} mt-4`}
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Contact className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              {contacts.length === 0 ? 'No contacts yet' : 'No matching contacts'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {contacts.length === 0
                ? 'Add the first person from your client team.'
                : 'Try a different search or clear the filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Client contacts</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Contact
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Department
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Email
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Phone
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2.5 font-medium text-slate-900">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                          {contact.contact_name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate">{contact.contact_name}</span>
                          <span className="block text-xs font-normal text-slate-500">
                            Added {formatDate(contact.created_at)}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.client_id
                        ? clientNames.get(contact.client_id) ?? 'Unknown client'
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {contact.department_id ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {departmentNames.get(contact.department_id) ?? 'Unknown'}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {contact.email ? (
                        <a href={`mailto:${contact.email}`} className="text-brand-700 hover:underline">
                          {contact.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {contact.phone ? (
                        <a href={`tel:${contact.phone}`} className="hover:underline">
                          {contact.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDialog(contact)}
                          className={rowActionClass}
                          aria-label={`Edit ${contact.contact_name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null)
                            setDeleteTarget(contact)
                          }}
                          className={rowDangerActionClass}
                          aria-label={`Delete ${contact.contact_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={dialog !== null}
        onClose={() => {
          if (!saving) {
            setDialog(null)
            setFormError(null)
          }
        }}
        title={dialog?.mode === 'edit' ? 'Edit contact' : 'New client contact'}
        description="Contacts are linked to a client and, optionally, one of that client's departments."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div>
            <label htmlFor="contact-client" className={labelClass}>
              Client <span className="text-red-500">*</span>
            </label>
            <select
              id="contact-client"
              value={form.client_id}
              onChange={(event) => handleClientChange(event.target.value)}
              required
              className={inputClass}
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="contact-department" className={labelClass}>
              Department
            </label>
            <select
              id="contact-department"
              value={form.department_id}
              onChange={(event) => updateForm('department_id', event.target.value)}
              disabled={!form.client_id || formDepartments.length === 0}
              className={inputClass}
            >
              <option value="">
                {!form.client_id
                  ? 'Select a client first'
                  : formDepartments.length === 0
                    ? 'No departments for this client'
                    : 'No department'}
              </option>
              {formDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.department_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="contact-name" className={labelClass}>
              Contact name <span className="text-red-500">*</span>
            </label>
            <input
              id="contact-name"
              value={form.contact_name}
              onChange={(event) => updateForm('contact_name', event.target.value)}
              required
              maxLength={120}
              placeholder="e.g. Dr. R. Sharma"
              autoFocus
              className={inputClass}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="contact-email" className={labelClass}>
                Email
              </label>
              <input
                id="contact-email"
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
              <label htmlFor="contact-phone" className={labelClass}>
                Phone
              </label>
              <input
                id="contact-phone"
                type="tel"
                value={form.phone}
                onChange={(event) => updateForm('phone', event.target.value)}
                maxLength={30}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setDialog(null)}
              disabled={saving}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving && <SpinnerIcon className="h-4 w-4" />}
              {saving ? 'Saving…' : dialog?.mode === 'edit' ? 'Save changes' : 'Add contact'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget?.contact_name ?? 'contact'}”?`}
        message="This permanently removes the contact. Existing records that reference this person may block the delete."
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

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="hidden h-4 w-32 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-slate-100 lg:block" />
          <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
