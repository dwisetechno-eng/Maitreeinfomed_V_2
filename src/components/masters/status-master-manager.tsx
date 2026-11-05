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

export type StatusMasterTable =
  | 'article_status_master'
  | 'proforma_status_master'
  | 'tax_status_master'

type StatusRow = {
  status_code: string
  status_label: string
  display_order: number | null
  description: string | null
  created_at: string | null
}

type FormState = {
  status_code: string
  status_label: string
  display_order: string
  description: string
}

type DialogState = { mode: 'create' } | { mode: 'edit'; row: StatusRow }

type StatusMasterManagerProps = {
  table: StatusMasterTable
  title: string
  description: string
  codePlaceholder?: string
  labelPlaceholder?: string
}

const EMPTY_FORM: FormState = {
  status_code: '',
  status_label: '',
  display_order: '0',
  description: '',
}

export function StatusMasterManager({
  table,
  title,
  description,
  codePlaceholder = 'e.g. IN_PROGRESS',
  labelPlaceholder = 'e.g. In Progress',
}: StatusMasterManagerProps) {
  const [rows, setRows] = useState<StatusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<StatusRow | null>(null)
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
          .from(table)
          .select('status_code, status_label, display_order, description, created_at')
          .order('display_order', { ascending: true })
          .order('status_code', { ascending: true })

        if (error) {
          throw error
        }

        setRows((data ?? []) as StatusRow[])
      } catch (error) {
        setLoadError(getErrorMessage(error, 'Unable to load statuses.'))
      } finally {
        if (!options?.silent) {
          setLoading(false)
        }
      }
    },
    [table]
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
      [row.status_code, row.status_label, row.description ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [rows, query])

  const closeDialog = useCallback(() => {
    setDialog(null)
    setFormError(null)
  }, [])

  function openCreateDialog() {
    const nextOrder =
      rows.reduce((max, row) => Math.max(max, row.display_order ?? 0), 0) + 1

    setForm({ ...EMPTY_FORM, display_order: String(nextOrder) })
    setFormError(null)
    setDialog({ mode: 'create' })
  }

  function openEditDialog(row: StatusRow) {
    setForm({
      status_code: row.status_code,
      status_label: row.status_label,
      display_order: row.display_order != null ? String(row.display_order) : '',
      description: row.description ?? '',
    })
    setFormError(null)
    setDialog({ mode: 'edit', row })
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!dialog) {
      return
    }

    const code = form.status_code.trim()
    const label = form.status_label.trim()

    if (!code || !label) {
      setFormError('Status code and status label are required.')
      return
    }

    const orderValue = form.display_order.trim() === '' ? 0 : Number(form.display_order)

    if (!Number.isFinite(orderValue)) {
      setFormError('Display order must be a number.')
      return
    }

    if (!hasSupabaseEnv()) {
      setFormError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      status_label: label,
      display_order: Math.trunc(orderValue),
      description: form.description.trim() || null,
    }

    try {
      const supabase = createClient()

      if (dialog.mode === 'edit') {
        const { error } = await supabase
          .from(table)
          .update(payload)
          .eq('status_code', dialog.row.status_code)

        if (error) {
          throw error
        }
      } else {
        const { error } = await supabase
          .from(table)
          .insert({ ...payload, status_code: code })

        if (error) {
          throw error
        }
      }

      setDialog(null)
      setNotice({
        tone: 'success',
        message:
          dialog.mode === 'edit'
            ? `“${label}” was updated.`
            : `“${label}” was added.`,
      })
      await loadRows({ silent: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Unable to save the status.'))
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
        .from(table)
        .delete()
        .eq('status_code', deleteTarget.status_code)

      if (error) {
        throw error
      }

      setNotice({ tone: 'success', message: `“${deleteTarget.status_label}” was deleted.` })
      setDeleteTarget(null)
      await loadRows({ silent: true })
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'Unable to delete the status.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Masters
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{description}</p>
        </div>

        <button type="button" onClick={openCreateDialog} className={primaryButtonClass}>
          <PlusIcon className="h-4 w-4" />
          Add status
        </button>
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search code, label or description"
              aria-label="Search statuses"
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <p className="text-xs text-slate-500">
              {filteredRows.length} of {rows.length} {rows.length === 1 ? 'status' : 'statuses'}
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
          <div className="border-b border-slate-200 px-4 py-3">
            <Alert tone="error" onDismiss={() => setLoadError(null)}>
              {loadError}
            </Alert>
          </div>
        )}

        {loading ? (
          <StatusTableSkeleton />
        ) : loadError && rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-red-700">Could not load statuses</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{loadError}</p>
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
            <InboxIcon className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              {rows.length === 0 ? 'No statuses yet' : 'No matching statuses'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {rows.length === 0
                ? 'Add the first status to start building this master.'
                : `Nothing matches “${query.trim()}”. Try a different search.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">{title} records</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-20 px-4 py-3 text-right">
                    Order
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Code
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Label
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Description
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
                {filteredRows.map((row) => (
                  <tr key={row.status_code} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.display_order ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700">
                        {row.status_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.status_label}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-600">
                      <span className="line-clamp-2">{row.description || '—'}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDialog(row)}
                          className={rowActionClass}
                          aria-label={`Edit ${row.status_label}`}
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
                          aria-label={`Delete ${row.status_label}`}
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
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
        onClose={closeDialog}
        title={dialog?.mode === 'edit' ? 'Edit status' : 'Add status'}
        description={
          dialog?.mode === 'edit'
            ? 'Update the label, order or description. The status code cannot be changed.'
            : 'Create a new status code for this master.'
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="status-code" className={labelClass}>
                Status code <span className="text-red-500">*</span>
              </label>
              <input
                id="status-code"
                value={form.status_code}
                onChange={(event) => updateForm('status_code', event.target.value.toUpperCase())}
                disabled={dialog?.mode === 'edit'}
                required
                maxLength={40}
                placeholder={codePlaceholder}
                autoFocus={dialog?.mode === 'create'}
                autoComplete="off"
                className={`${inputClass} font-mono uppercase`}
              />
            </div>

            <div>
              <label htmlFor="status-label" className={labelClass}>
                Status label <span className="text-red-500">*</span>
              </label>
              <input
                id="status-label"
                value={form.status_label}
                onChange={(event) => updateForm('status_label', event.target.value)}
                required
                maxLength={80}
                placeholder={labelPlaceholder}
                autoFocus={dialog?.mode === 'edit'}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="status-order" className={labelClass}>
              Display order
            </label>
            <input
              id="status-order"
              type="number"
              inputMode="numeric"
              step={1}
              value={form.display_order}
              onChange={(event) => updateForm('display_order', event.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-slate-500">
              Lower numbers appear first in picklists.
            </p>
          </div>

          <div>
            <label htmlFor="status-description" className={labelClass}>
              Description
            </label>
            <textarea
              id="status-description"
              rows={3}
              value={form.description}
              onChange={(event) => updateForm('description', event.target.value)}
              maxLength={300}
              placeholder="Optional notes about when this status applies"
              className={`${inputClass} resize-y`}
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
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
                  : 'Add status'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget?.status_label ?? 'status'}”?`}
        message="This permanently removes the status from this master. If existing records reference it, the database will reject the delete."
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

function StatusTableSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="h-4 w-8 animate-pulse rounded bg-slate-100" />
          <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
          <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="hidden h-4 w-32 animate-pulse rounded bg-slate-100 sm:block" />
        </div>
      ))}
    </div>
  )
}
