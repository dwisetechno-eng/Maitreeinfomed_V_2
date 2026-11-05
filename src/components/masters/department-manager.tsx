'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Layers, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'

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

type ClientRow = {
  id: string
  company_name: string
}

type DepartmentRow = {
  id: string
  department_name: string
  client_id: string | null
  created_at: string | null
}

type FormState = {
  department_name: string
  client_id: string
}

type DialogState = { mode: 'create' } | { mode: 'edit'; row: DepartmentRow }

const EMPTY_FORM: FormState = { department_name: '', client_id: '' }

export function DepartmentManager() {
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<DepartmentRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const clientNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const client of clients) {
      map.set(client.id, client.company_name)
    }
    return map
  }, [clients])

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
      const [departmentsResult, clientsResult] = await Promise.all([
        supabase
          .from('departments')
          .select('id, department_name, client_id, created_at')
          .order('department_name', { ascending: true }),
        supabase.from('clients').select('id, company_name').order('company_name', { ascending: true }),
      ])

      if (departmentsResult.error) {
        throw departmentsResult.error
      }

      if (clientsResult.error) {
        throw clientsResult.error
      }

      setDepartments((departmentsResult.data ?? []) as DepartmentRow[])
      setClients((clientsResult.data ?? []) as ClientRow[])
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load departments.'))
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredDepartments = useMemo(() => {
    const term = query.trim().toLowerCase()

    if (!term) {
      return departments
    }

    return departments.filter((department) =>
      [department.department_name, clientNames.get(department.client_id ?? '') ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [clientNames, departments, query])

  function openCreateDialog() {
    setForm({ ...EMPTY_FORM, client_id: clients[0]?.id ?? '' })
    setFormError(null)
    setDialog({ mode: 'create' })
  }

  function openEditDialog(row: DepartmentRow) {
    setForm({
      department_name: row.department_name,
      client_id: row.client_id ?? '',
    })
    setFormError(null)
    setDialog({ mode: 'edit', row })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!dialog) {
      return
    }

    const name = form.department_name.trim()

    if (!name) {
      setFormError('Department name is required.')
      return
    }

    if (!form.client_id) {
      setFormError('Select the client this department belongs to.')
      return
    }

    if (!hasSupabaseEnv()) {
      setFormError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      department_name: name,
      client_id: form.client_id,
    }

    try {
      const supabase = createClient()

      if (dialog.mode === 'edit') {
        const { error } = await supabase
          .from('departments')
          .update(payload)
          .eq('id', dialog.row.id)

        if (error) {
          throw error
        }
      } else {
        const { error } = await supabase.from('departments').insert(payload)

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
            : `“${name}” was added to ${clientNames.get(form.client_id) ?? 'the client'}.`,
      })
      await loadData({ silent: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Unable to save the department.'))
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
      const { error } = await supabase.from('departments').delete().eq('id', deleteTarget.id)

      if (error) {
        throw error
      }

      setNotice({ tone: 'success', message: `“${deleteTarget.department_name}” was deleted.` })
      setDeleteTarget(null)
      await loadData({ silent: true })
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'Unable to delete the department.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">Masters</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Departments</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Organise each client&apos;s teams so article requests, contacts and invoices stay grouped.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDialog}
          className={primaryButtonClass}
          disabled={loading || clients.length === 0}
        >
          <Plus className="h-4 w-4" />
          Add department
        </button>
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      {!loading && clients.length === 0 && (
        <Alert tone="error">
          Add a client under Masters → Clients before creating departments.
        </Alert>
      )}

      <div className={`overflow-hidden ${cardClass}`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search department or client"
              aria-label="Search departments"
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-xs text-slate-500">
              {filteredDepartments.length} of {departments.length}{' '}
              {departments.length === 1 ? 'department' : 'departments'}
            </p>
            <button
              type="button"
              onClick={() => void loadData()}
              disabled={loading}
              className={`${secondaryButtonClass} px-2.5 py-1.5`}
            >
              {loading ? <SpinnerIcon className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {loadError && departments.length > 0 && (
          <div className="border-b border-slate-200 px-4 py-3">
            <Alert tone="error" onDismiss={() => setLoadError(null)}>
              {loadError}
            </Alert>
          </div>
        )}

        {loading ? (
          <TableSkeleton />
        ) : loadError && departments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-red-700">Could not load departments</p>
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
        ) : filteredDepartments.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Layers className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              {departments.length === 0 ? 'No departments yet' : 'No matching departments'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {departments.length === 0
                ? 'Add the first department and assign it to a client.'
                : `Nothing matches “${query.trim()}”. Try a different search.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Departments</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Department
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Created
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDepartments.map((department) => (
                  <tr key={department.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2 font-medium text-slate-900">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                          <Layers className="h-4 w-4" />
                        </span>
                        {department.department_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {department.client_id
                        ? clientNames.get(department.client_id) ?? 'Unknown client'
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(department.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDialog(department)}
                          className={rowActionClass}
                          aria-label={`Edit ${department.department_name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null)
                            setDeleteTarget(department)
                          }}
                          className={rowDangerActionClass}
                          aria-label={`Delete ${department.department_name}`}
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
        title={dialog?.mode === 'edit' ? 'Edit department' : 'New department'}
        description="Departments belong to a client and are used across requests, contacts and invoices."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div>
            <label htmlFor="department-client" className={labelClass}>
              Client <span className="text-red-500">*</span>
            </label>
            <select
              id="department-client"
              value={form.client_id}
              onChange={(event) => setForm((current) => ({ ...current, client_id: event.target.value }))}
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
            <label htmlFor="department-name" className={labelClass}>
              Department name <span className="text-red-500">*</span>
            </label>
            <input
              id="department-name"
              value={form.department_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, department_name: event.target.value }))
              }
              required
              maxLength={120}
              placeholder="e.g. Medical Writing"
              autoFocus
              className={inputClass}
            />
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
              {saving ? 'Saving…' : dialog?.mode === 'edit' ? 'Save changes' : 'Add department'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget?.department_name ?? 'department'}”?`}
        message="This permanently removes the department. Contacts, requests or invoices that reference it may block the delete."
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
          <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="hidden h-4 w-40 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
