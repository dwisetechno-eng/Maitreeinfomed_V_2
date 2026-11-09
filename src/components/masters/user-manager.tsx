'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Alert } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Modal } from '@/components/ui/modal'
import {
  InboxIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SpinnerIcon,
  TrashIcon,
} from '@/components/ui/icons'
import {
  SUPABASE_SETUP_MESSAGE,
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
import {
  APP_ROLES,
  ROLE_LABELS,
  type AppRole,
  canManageUsers,
} from '@/lib/roles'
import {
  createAppUser,
  deleteAppUser,
  getUserAdminDiagnostics,
  listAppUsers,
  updateAppUser,
  type AppUserRow,
} from '@/actions/users'
import type { ServiceRoleStatus } from '@/lib/service-role'

type FormState = {
  email: string
  password: string
  fullName: string
  role: AppRole
}

const EMPTY_FORM: FormState = {
  email: '',
  password: '',
  fullName: '',
  role: 'user',
}

export function UserManager() {
  const [users, setUsers] = useState<AppUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(
    null
  )
  const [error, setError] = useState<string | null>(null)
  const [accessDenied, setAccessDenied] = useState(false)
  const [serviceRoleMissing, setServiceRoleMissing] = useState(false)
  const [diagnostics, setDiagnostics] = useState<ServiceRoleStatus | null>(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AppUserRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AppUserRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [currentRole, setCurrentRole] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    if (!hasSupabaseEnv()) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle()
        setCurrentRole((profile as { role?: string | null } | null)?.role?.trim().toLowerCase() ?? null)
      }

      const result = await listAppUsers()
      if (!result.ok) {
        if (result.error.toLowerCase().includes('only administrators')) {
          setAccessDenied(true)
        }
        setError(result.error)
        setUsers([])
        return
      }

      setUsers(result.users)
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load users.'))
    } finally {
      setLoading(false)
    }
  }, [])

  const runDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true)
    try {
      const result = await getUserAdminDiagnostics()
      setDiagnostics(result.ok ? result.status : null)
    } catch {
      setDiagnostics(null)
    } finally {
      setDiagnosticsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (serviceRoleMissing) {
      void runDiagnostics()
    }
  }, [serviceRoleMissing, runDiagnostics])

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) {
      return users
    }
    return users.filter((user) =>
      [user.email ?? '', user.fullName ?? '', user.role]
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [query, users])

  function openCreateDialog() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
    setError(null)
  }

  function openEditDialog(user: AppUserRow) {
    setEditing(user)
    setForm({
      email: user.email ?? '',
      password: '',
      fullName: user.fullName ?? '',
      role: (user.role as AppRole) ?? 'user',
    })
    setDialogOpen(true)
    setError(null)
  }

  function closeDialog() {
    if (saving) {
      return
    }
    setDialogOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      if (editing) {
        const result = await updateAppUser({
          id: editing.id,
          fullName: form.fullName,
          role: form.role,
        })
        if (!result.ok) {
          throw new Error(result.error)
        }
        setNotice({ tone: 'success', message: result.message ?? 'User updated.' })
      } else {
        const result = await createAppUser({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
        })
        if (!result.ok) {
          if (result.error.includes('SUPABASE_SERVICE_ROLE_KEY')) {
            setServiceRoleMissing(true)
          }
          throw new Error(result.error)
        }
        setNotice({ tone: 'success', message: result.message ?? 'User created.' })
      }

      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await loadUsers()
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Unable to save the user.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget || deleting) {
      return
    }

    setDeleting(true)
    setError(null)

    try {
      const result = await deleteAppUser(deleteTarget.id)
      if (!result.ok) {
        throw new Error(result.error)
      }
      setNotice({ tone: 'success', message: result.message ?? 'User deleted.' })
      setDeleteTarget(null)
      await loadUsers()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Unable to delete the user.'))
    } finally {
      setDeleting(false)
    }
  }

  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Alert tone="error">{SUPABASE_SETUP_MESSAGE}</Alert>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Alert tone="error">
          Access restricted: only administrators can manage users.
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {serviceRoleMissing && (
        <Alert tone="error">
          <p>
            Creating or fully deleting users requires the server-side
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-xs">
              SUPABASE_SERVICE_ROLE_KEY
            </code>
            environment variable.
          </p>

          <div className="mt-3 rounded-lg border border-red-200 bg-white/70 px-3 py-2 text-xs text-slate-700">
            {diagnosticsLoading ? (
              <p>Checking what the server can see…</p>
            ) : diagnostics ? (
              <ul className="space-y-1">
                <li>
                  Supabase URL:{' '}
                  <strong>{diagnostics.urlConfigured ? 'configured' : 'missing'}</strong>
                </li>
                <li>
                  Service role key:{' '}
                  <strong>
                    {diagnostics.keyFoundIn.length > 0
                      ? `found (${diagnostics.keyFoundIn.join(', ')})`
                      : 'not found'}
                  </strong>
                </li>
                <li className="text-slate-500">
                  Checked: {diagnostics.checkedNames.join(', ')}
                </li>
                {!diagnostics.available && (
                  <li className="text-slate-500">
                    Add the missing variable for the <strong>Production</strong> environment
                    in Vercel, then redeploy — environment changes only apply to new
                    deployments.
                  </li>
                )}
              </ul>
            ) : (
              <p>Configuration check unavailable.</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void runDiagnostics()}
            disabled={diagnosticsLoading}
            className={`${secondaryButtonClass} mt-3`}
          >
            <RefreshIcon className="h-4 w-4" />
            {diagnosticsLoading ? 'Checking…' : 'Run configuration check'}
          </button>
        </Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search users by email, name or role"
            className={`${inputClass} pl-9`}
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadUsers()}
            className={secondaryButtonClass}
            disabled={loading}
          >
            <RefreshIcon className="h-4 w-4" />
            Refresh
          </button>
          {canManageUsers(currentRole) && (
            <button
              type="button"
              onClick={openCreateDialog}
              className={primaryButtonClass}
            >
              <PlusIcon className="h-4 w-4" />
              New user
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <caption className="sr-only">Application users</caption>
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Email
                </th>
                <th scope="col" className="px-4 py-3">
                  Full name
                </th>
                <th scope="col" className="px-4 py-3">
                  Role
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
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    <SpinnerIcon className="mx-auto h-5 w-5" />
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    <InboxIcon className="mx-auto mb-2 h-6 w-6" />
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {user.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {user.fullName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {ROLE_LABELS[user.role as AppRole] ?? user.role}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {user.createdAt
                        ? new Date(user.createdAt).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDialog(user)}
                          className={rowActionClass}
                          aria-label={`Edit ${user.email ?? 'user'}`}
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(user)}
                          className={rowDangerActionClass}
                          aria-label={`Delete ${user.email ?? 'user'}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={dialogOpen}
        title={editing ? 'Edit user' : 'New user'}
        onClose={closeDialog}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editing && (
            <div>
              <label htmlFor="user-email" className={labelClass}>
                Email
              </label>
              <input
                id="user-email"
                type="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                className={inputClass}
                placeholder="user@maitreeinfomed.com"
              />
            </div>
          )}

          {!editing && (
            <div>
              <label htmlFor="user-password" className={labelClass}>
                Password
              </label>
              <input
                id="user-password"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                className={inputClass}
                placeholder="At least 8 characters"
              />
            </div>
          )}

          <div>
            <label htmlFor="user-name" className={labelClass}>
              Full name
            </label>
            <input
              id="user-name"
              value={form.fullName}
              onChange={(event) =>
                setForm((current) => ({ ...current, fullName: event.target.value }))
              }
              className={inputClass}
              placeholder="Jane Doe"
            />
          </div>

          <div>
            <label htmlFor="user-role" className={labelClass}>
              Role
            </label>
            <select
              id="user-role"
              value={form.role}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  role: event.target.value as AppRole,
                }))
              }
              className={inputClass}
            >
              {APP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeDialog}
              className={secondaryButtonClass}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className={primaryButtonClass} disabled={saving}>
              {saving ? <SpinnerIcon className="h-4 w-4" /> : null}
              {editing ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete user?"
        message={
          deleteTarget
            ? `This will remove ${deleteTarget.email ?? 'this user'} and their profile. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null)
          }
        }}
      />
    </div>
  )
}

function PageHeader() {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
        Administration
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
        Users
      </h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Manage application users and assign roles (administrator, manager, user).
      </p>
    </div>
  )
}
