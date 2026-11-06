'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Download,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'

import { CreateProformaDialog } from '@/components/dialogs/CreateProformaDialog'
import {
  SUPABASE_SETUP_MESSAGE,
  badgeClass,
  cardClass,
  formatCurrency,
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
import { InboxIcon, PlusIcon, RefreshIcon, SpinnerIcon } from '@/components/ui/icons'
import { Modal } from '@/components/ui/modal'
import {
  getArticleQuantity,
  getArticleRate,
  getArticleTitle,
  type ArticleRequestRow,
} from '@/lib/article-request-meta'
import {
  articleLinkAmount,
  fetchPendingArticleStatus,
  PI_GENERATED_STATUS,
  recalculateProformaTotals,
} from '@/lib/invoice-links'
import { extractMissingColumn, roundMoney } from '@/lib/proforma-invoices'
import { isMissingColumnError } from '@/lib/supabase-errors'
import { createClient } from '@/utils/supabase/client'

type ClientOption = { id: string; company_name: string }
type StatusOption = { status_code: string; status_label: string; display_order: number | null }

type ProformaInvoiceRow = {
  id: string
  pi_number: string | null
  pi_date: string | null
  client_id: string | null
  status_code: string | null
  subtotal: number | null
  tax_rate?: number | null
  tax_amount?: number | null
  grand_total: number | null
  invoice_date: string | null
  tax_invoice_id?: string | null
  created_at: string | null
}

type LinkedArticle = ArticleRequestRow

type EditForm = {
  pi_number: string
  pi_date: string
  status_code: string
  subtotal: string
  tax_rate: string
}

const STATUS_TONES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  SENT_TO_CLIENT: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  PARTIALLY_BILLED: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  TAX_INVOICE_GENERATED: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}

const EMPTY_EDIT_FORM: EditForm = {
  pi_number: '',
  pi_date: '',
  status_code: '',
  subtotal: '0',
  tax_rate: '18',
}

export function ProformaInvoicesManager() {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [statuses, setStatuses] = useState<StatusOption[]>([])
  const [invoices, setInvoices] = useState<ProformaInvoiceRow[]>([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [createOpen, setCreateOpen] = useState(false)

  const [viewTarget, setViewTarget] = useState<ProformaInvoiceRow | null>(null)
  const [viewArticles, setViewArticles] = useState<LinkedArticle[]>([])
  const [viewAvailable, setViewAvailable] = useState<LinkedArticle[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)
  const [viewPickerOpen, setViewPickerOpen] = useState(false)
  const [viewSelectedIds, setViewSelectedIds] = useState<Set<string>>(new Set())
  const [viewSaving, setViewSaving] = useState(false)
  const [viewActionError, setViewActionError] = useState<string | null>(null)

  const [editTarget, setEditTarget] = useState<ProformaInvoiceRow | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_EDIT_FORM)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ProformaInvoiceRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const clientNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const client of clients) {
      map.set(client.id, client.company_name)
    }
    return map
  }, [clients])

  const statusLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const status of statuses) {
      map.set(status.status_code, status.status_label)
    }
    return map
  }, [statuses])

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
      const [clientsResult, invoicesResult, statusesResult] = await Promise.all([
        supabase.from('clients').select('id, company_name').order('company_name'),
        supabase
          .from('proforma_invoices')
          .select('*')
          .order('pi_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('proforma_status_master')
          .select('status_code, status_label, display_order')
          .order('display_order', { ascending: true })
          .order('status_code', { ascending: true }),
      ])

      if (clientsResult.error) {
        throw clientsResult.error
      }

      if (invoicesResult.error) {
        throw invoicesResult.error
      }

      if (statusesResult.error) {
        throw statusesResult.error
      }

      setClients((clientsResult.data ?? []) as ClientOption[])
      setInvoices((invoicesResult.data ?? []) as ProformaInvoiceRow[])
      setStatuses((statusesResult.data ?? []) as StatusOption[])
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load proforma invoices.'))
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredInvoices = useMemo(() => {
    const term = query.trim().toLowerCase()

    return invoices.filter((invoice) => {
      if (clientFilter && invoice.client_id !== clientFilter) {
        return false
      }

      if (statusFilter && invoice.status_code !== statusFilter) {
        return false
      }

      if (!term) {
        return true
      }

      return [
        invoice.pi_number ?? '',
        invoice.client_id ? clientNames.get(invoice.client_id) ?? '' : '',
        invoice.status_code ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [clientFilter, clientNames, invoices, query, statusFilter])

  const summary = useMemo(() => {
    const total = roundMoney(
      invoices.reduce((sum, invoice) => sum + toNumber(invoice.grand_total), 0)
    )
    const thisMonth = new Date().toISOString().slice(0, 7)
    const monthInvoices = invoices.filter((invoice) =>
      (invoice.pi_date ?? invoice.invoice_date ?? invoice.created_at ?? '')
        .slice(0, 7)
        .startsWith(thisMonth)
    )
    const monthTotal = roundMoney(
      monthInvoices.reduce((sum, invoice) => sum + toNumber(invoice.grand_total), 0)
    )

    return { total, monthCount: monthInvoices.length, monthTotal }
  }, [invoices])

  const viewLocked = Boolean(viewTarget?.tax_invoice_id)

  const refreshViewTarget = useCallback(async (invoiceId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('proforma_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle()

    if (!error && data) {
      setViewTarget(data as ProformaInvoiceRow)
    }
  }, [])

  useEffect(() => {
    if (!viewTarget) {
      setViewArticles([])
      setViewAvailable([])
      setViewError(null)
      setViewActionError(null)
      setViewPickerOpen(false)
      setViewSelectedIds(new Set())
      return
    }

    let cancelled = false
    const invoice = viewTarget

    async function loadViewData() {
      setViewLoading(true)
      setViewError(null)

      try {
        const supabase = createClient()
        const linkedResult = await supabase
          .from('article_requests')
          .select('*')
          .eq('proforma_invoice_id', invoice.id)
          .order('created_at', { ascending: true })

        if (linkedResult.error) {
          throw linkedResult.error
        }

        let available: LinkedArticle[] = []

        // Requests that are not on any invoice for the same client can be
        // pulled into this proforma. A billed proforma is locked, so we skip
        // the query entirely.
        if (invoice.client_id && !invoice.tax_invoice_id) {
          const availableResult = await supabase
            .from('article_requests')
            .select('*')
            .is('proforma_invoice_id', null)
            .is('tax_invoice_id', null)
            .eq('client_id', invoice.client_id)
            .order('request_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })

          if (availableResult.error) {
            throw availableResult.error
          }

          available = (availableResult.data ?? []) as LinkedArticle[]
        }

        if (!cancelled) {
          setViewArticles((linkedResult.data ?? []) as LinkedArticle[])
          setViewAvailable(available)
        }
      } catch (error) {
        if (!cancelled) {
          setViewArticles([])
          setViewAvailable([])
          setViewError(getErrorMessage(error, 'Unable to load the article requests for this invoice.'))
        }
      } finally {
        if (!cancelled) {
          setViewLoading(false)
        }
      }
    }

    void loadViewData()

    return () => {
      cancelled = true
    }
  }, [viewTarget])

  async function handleRemoveArticle(article: LinkedArticle) {
    if (!viewTarget) {
      return
    }

    if (viewLocked) {
      setViewActionError(
        'This proforma invoice has already been converted to a tax invoice, so its articles cannot be changed.'
      )
      return
    }

    setViewSaving(true)
    setViewActionError(null)

    try {
      const supabase = createClient()
      const pendingStatus = await fetchPendingArticleStatus(supabase)

      const { error } = await supabase
        .from('article_requests')
        .update({
          proforma_invoice_id: null,
          tax_invoice_id: null,
          status_code: pendingStatus,
        })
        .eq('id', article.id)

      if (error) {
        throw error
      }

      await recalculateProformaTotals(supabase, viewTarget.id)
      await refreshViewTarget(viewTarget.id)
      await loadData({ silent: true })
    } catch (error) {
      setViewActionError(
        getErrorMessage(error, 'Unable to remove the article request from this invoice.')
      )
    } finally {
      setViewSaving(false)
    }
  }

  async function handleAddArticles() {
    if (!viewTarget || viewSelectedIds.size === 0) {
      return
    }

    if (viewLocked) {
      setViewActionError(
        'This proforma invoice has already been converted to a tax invoice, so its articles cannot be changed.'
      )
      return
    }

    setViewSaving(true)
    setViewActionError(null)

    try {
      const supabase = createClient()
      const ids = Array.from(viewSelectedIds)

      const { error } = await supabase
        .from('article_requests')
        .update({
          proforma_invoice_id: viewTarget.id,
          status_code: PI_GENERATED_STATUS,
        })
        .in('id', ids)
        .is('proforma_invoice_id', null)

      if (error) {
        throw error
      }

      await recalculateProformaTotals(supabase, viewTarget.id)
      setViewSelectedIds(new Set())
      setViewPickerOpen(false)
      await refreshViewTarget(viewTarget.id)
      await loadData({ silent: true })
    } catch (error) {
      setViewActionError(
        getErrorMessage(error, 'Unable to add the selected article requests to this invoice.')
      )
    } finally {
      setViewSaving(false)
    }
  }

  function toggleViewSelection(articleId: string) {
    setViewSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(articleId)) {
        next.delete(articleId)
      } else {
        next.add(articleId)
      }
      return next
    })
    setViewActionError(null)
  }

  function openEditDialog(row: ProformaInvoiceRow) {
    setEditForm({
      pi_number: row.pi_number ?? '',
      pi_date: (row.pi_date ?? row.invoice_date ?? today()).slice(0, 10),
      status_code: row.status_code ?? '',
      subtotal: String(toNumber(row.subtotal)),
      tax_rate: String(toNumber(row.tax_rate ?? 18)),
    })
    setEditError(null)
    setEditTarget(row)
  }

  function updateEditForm<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setEditForm((current) => ({ ...current, [key]: value }))
    setEditError(null)
  }

  const editSubtotal = Number(editForm.subtotal)
  const editTaxRate = Number(editForm.tax_rate)
  const safeEditSubtotal = Number.isFinite(editSubtotal) ? Math.max(0, editSubtotal) : 0
  const safeEditTaxRate = Number.isFinite(editTaxRate) ? Math.max(0, editTaxRate) : 0
  const editTaxAmount = roundMoney((safeEditSubtotal * safeEditTaxRate) / 100)
  const editGrandTotal = roundMoney(safeEditSubtotal + editTaxAmount)

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!editTarget) {
      return
    }

    if (editTarget.tax_invoice_id) {
      setEditError(
        'This proforma invoice has already been converted to a tax invoice and can no longer be edited.'
      )
      return
    }

    const piNumber = editForm.pi_number.trim()

    if (!piNumber) {
      setEditError('Enter the proforma invoice number.')
      return
    }

    if (!editForm.pi_date) {
      setEditError('Choose the proforma invoice date.')
      return
    }

    if (!Number.isFinite(editSubtotal) || editSubtotal < 0) {
      setEditError('Subtotal must be zero or a positive number.')
      return
    }

    if (!Number.isFinite(editTaxRate) || editTaxRate < 0) {
      setEditError('GST rate must be zero or a positive number.')
      return
    }

    if (!hasSupabaseEnv()) {
      setEditError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setEditError(null)

    const supabase = createClient()
    const body: Record<string, unknown> = {
      pi_number: piNumber,
      pi_date: editForm.pi_date,
      invoice_date: editForm.pi_date,
      status_code: editForm.status_code || null,
      subtotal: roundMoney(safeEditSubtotal),
      tax_rate: safeEditTaxRate,
      tax_amount: editTaxAmount,
      grand_total: editGrandTotal,
    }

    try {
      const error = await updateWithColumnFallback(supabase, editTarget.id, body)

      if (error) {
        throw error
      }

      setEditTarget(null)
      setNotice({
        tone: 'success',
        message: `Proforma invoice ${piNumber} was updated.`,
      })
      await loadData({ silent: true })
    } catch (error) {
      setEditError(getErrorMessage(error, 'Unable to update the proforma invoice.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return
    }

    if (deleteTarget.tax_invoice_id) {
      setDeleteError(
        'This proforma invoice has been converted to a tax invoice. Remove it from the tax invoice first.'
      )
      return
    }

    if (!hasSupabaseEnv()) {
      setDeleteError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setDeleting(true)
    setDeleteError(null)

    const supabase = createClient()
    const invoiceId = deleteTarget.id

    let linkedRows: Array<{ id: string; status_code: string | null }> = []
    let unlinked = false

    try {
      // Article statuses live in their own master table; the proforma status
      // list here must not be used for article requests.
      let pendingStatus: string | null = 'REQUEST_SENT'
      const { data: articleStatuses } = await supabase
        .from('article_status_master')
        .select('status_code')
        .order('display_order', { ascending: true })

      if (articleStatuses && articleStatuses.length > 0) {
        pendingStatus =
          (articleStatuses as Array<{ status_code: string }>).find(
            (status) => status.status_code === 'REQUEST_SENT'
          )?.status_code ?? (articleStatuses[0] as { status_code: string }).status_code
      }

      const { data, error: linkedError } = await supabase
        .from('article_requests')
        .select('id, status_code')
        .eq('proforma_invoice_id', invoiceId)

      if (linkedError) {
        throw linkedError
      }

      linkedRows = (data ?? []) as Array<{ id: string; status_code: string | null }>

      if (linkedRows.length > 0) {
        const { error: unlinkError } = await supabase
          .from('article_requests')
          .update({
            proforma_invoice_id: null,
            tax_invoice_id: null,
            status_code: pendingStatus,
          })
          .eq('proforma_invoice_id', invoiceId)

        if (unlinkError) {
          throw unlinkError
        }

        unlinked = true
      }

      const { error } = await supabase
        .from('proforma_invoices')
        .delete()
        .eq('id', invoiceId)

      if (error) {
        throw error
      }

      setNotice({
        tone: 'success',
        message: `Proforma invoice ${deleteTarget.pi_number ?? ''} was deleted${
          linkedRows.length > 0
            ? ` and ${linkedRows.length} article request${
                linkedRows.length === 1 ? '' : 's'
              } returned to pending`
            : ''
        }.`,
      })
      setDeleteTarget(null)
      await loadData({ silent: true })
    } catch (error) {
      // Best-effort restore so the requests do not remain orphaned.
      if (unlinked) {
        for (const row of linkedRows) {
          try {
            await supabase
              .from('article_requests')
              .update({
                proforma_invoice_id: invoiceId,
                status_code: row.status_code,
              })
              .eq('id', row.id)
          } catch {
            // Best effort only.
          }
        }
      }

      setDeleteError(getErrorMessage(error, 'Unable to delete the proforma invoice.'))
    } finally {
      setDeleting(false)
    }
  }

  function handleDownloadWord(invoice: ProformaInvoiceRow) {
    const reference = invoice.pi_number?.trim() || invoice.id.slice(0, 8).toUpperCase()
    window.alert(
      `Word export is coming soon.\n\n${reference} will be downloadable as a .docx once the invoice template is connected.`
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Invoicing
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Proforma Invoices
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Group unbilled article requests into a proforma invoice by selecting individual requests
            or an entire imported batch.
          </p>
        </div>

        <button type="button" onClick={() => setCreateOpen(true)} className={primaryButtonClass}>
          <PlusIcon className="h-4 w-4" />
          New proforma invoice
        </button>
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Invoiced value"
          value={formatCurrency(summary.total)}
          hint={`${invoices.length} proforma invoice${invoices.length === 1 ? '' : 's'}`}
        />
        <SummaryCard
          label="Created this month"
          value={String(summary.monthCount)}
          hint={formatCurrency(summary.monthTotal)}
        />
        <SummaryCard
          label="Awaiting attention"
          value={String(
            invoices.filter(
              (invoice) =>
                invoice.status_code !== 'CANCELLED' &&
                invoice.status_code !== 'TAX_INVOICE_GENERATED'
            ).length
          )}
          hint="Open proforma invoices"
        />
      </div>

      <div className={`overflow-hidden ${cardClass}`}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search invoice number or client"
              aria-label="Search proforma invoices"
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="pi-client-filter">
              Filter by client
            </label>
            <select
              id="pi-client-filter"
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

            <label className="sr-only" htmlFor="pi-status-filter">
              Filter by status
            </label>
            <select
              id="pi-status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={`${inputClass} sm:w-44`}
            >
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status.status_code} value={status.status_code}>
                  {status.status_label}
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

        {loadError && invoices.length > 0 && (
          <div className="border-b border-slate-200 px-4 py-3">
            <Alert tone="error" onDismiss={() => setLoadError(null)}>
              {loadError}
            </Alert>
          </div>
        )}

        {loading ? (
          <TableSkeleton />
        ) : loadError && invoices.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-red-700">Could not load proforma invoices</p>
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
        ) : filteredInvoices.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <InboxIcon className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              {invoices.length === 0 ? 'No proforma invoices yet' : 'No matching invoices'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {invoices.length === 0
                ? 'Create one to group unbilled article requests for a client.'
                : 'Try a different search or clear the filters.'}
            </p>
            {invoices.length === 0 && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className={`${secondaryButtonClass} mt-4`}
              >
                <PlusIcon className="h-4 w-4" />
                New proforma invoice
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1050px] divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Proforma invoices</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Invoice number
                  </th>
                  <th scope="col" className="px-4 py-3">
                    PI date
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Subtotal
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    GST
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Grand total
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-mono text-xs font-medium text-slate-700">
                        {invoice.pi_number?.trim() || invoice.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(invoice.pi_date ?? invoice.invoice_date ?? invoice.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {invoice.client_id
                        ? clientNames.get(invoice.client_id) ?? 'Unknown client'
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {invoice.status_code ? (
                        <span
                          className={`${badgeClass} ${
                            STATUS_TONES[invoice.status_code] ??
                            'bg-slate-100 text-slate-600 ring-slate-500/20'
                          }`}
                          title={statusLabels.get(invoice.status_code) ?? invoice.status_code}
                        >
                          {invoice.status_code}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatCurrency(invoice.subtotal)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatCurrency(
                        invoice.tax_amount ??
                          Math.max(
                            0,
                            toNumber(invoice.grand_total) - toNumber(invoice.subtotal)
                          )
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatCurrency(invoice.grand_total)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewTarget(invoice)}
                          className={rowActionClass}
                          aria-label={`View ${invoice.pi_number ?? 'invoice'}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadWord(invoice)}
                          className={rowActionClass}
                          aria-label={`Download ${invoice.pi_number ?? 'invoice'} as Word`}
                          title="Download Word (.docx)"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Word
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditDialog(invoice)}
                          className={rowActionClass}
                          aria-label={`Edit ${invoice.pi_number ?? 'invoice'}`}
                          disabled={Boolean(invoice.tax_invoice_id)}
                          title={
                            invoice.tax_invoice_id
                              ? 'This proforma invoice has been converted to a tax invoice'
                              : undefined
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null)
                            setDeleteTarget(invoice)
                          }}
                          className={rowDangerActionClass}
                          aria-label={`Delete ${invoice.pi_number ?? 'invoice'}`}
                          disabled={Boolean(invoice.tax_invoice_id)}
                          title={
                            invoice.tax_invoice_id
                              ? 'Remove this proforma invoice from its tax invoice first'
                              : undefined
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      <CreateProformaDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setNotice({
            tone: 'success',
            message:
              'Proforma invoice created and the selected article requests marked as PI generated.',
          })
          void loadData({ silent: true })
        }}
      />

      <Modal
        open={viewTarget !== null}
        onClose={() => setViewTarget(null)}
        size="4xl"
        title={`Proforma invoice ${viewTarget?.pi_number ?? ''}`}
        description="Review the invoice details and the article requests linked to it."
      >
        {viewTarget && (
          <div className="space-y-5">
            <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="PI number" value={viewTarget.pi_number ?? '—'} mono />
              <Detail
                label="PI date"
                value={formatDate(viewTarget.pi_date ?? viewTarget.invoice_date)}
              />
              <Detail
                label="Client"
                value={
                  viewTarget.client_id
                    ? clientNames.get(viewTarget.client_id) ?? 'Unknown client'
                    : '—'
                }
              />
              <Detail label="Status" value={viewTarget.status_code ?? '—'} />
              <Detail label="Subtotal" value={formatCurrency(viewTarget.subtotal)} />
              <Detail
                label="GST"
                value={formatCurrency(
                  viewTarget.tax_amount ??
                    Math.max(
                      0,
                      toNumber(viewTarget.grand_total) - toNumber(viewTarget.subtotal)
                    )
                )}
              />
              <Detail label="Grand total" value={formatCurrency(viewTarget.grand_total)} />
              <Detail
                label="Created"
                value={formatDate(viewTarget.created_at)}
              />
            </dl>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Linked article requests ({viewArticles.length})
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Remove a request to send it back to the pending queue, or pull in more requests
                    from the same client.
                  </p>
                </div>
                {!viewLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setViewPickerOpen((open) => !open)
                      setViewActionError(null)
                    }}
                    className={`${secondaryButtonClass} px-2.5 py-1.5 text-xs`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {viewPickerOpen ? 'Close picker' : 'Add articles'}
                  </button>
                )}
              </div>

              {viewLocked && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                  This proforma invoice has been converted to a tax invoice. Remove or add the
                  linked tax invoice first to edit these articles.
                </div>
              )}

              {viewError && (
                <div className="px-4 py-3">
                  <Alert tone="error" onDismiss={() => setViewError(null)}>
                    {viewError}
                  </Alert>
                </div>
              )}

              {viewActionError && (
                <div className="px-4 py-3">
                  <Alert tone="error" onDismiss={() => setViewActionError(null)}>
                    {viewActionError}
                  </Alert>
                </div>
              )}

              {viewLoading ? (
                <div className="space-y-2 p-4" aria-hidden="true">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                  ))}
                </div>
              ) : viewArticles.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  No article requests are linked to this invoice.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">
                          Article
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          Qty
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          Rate
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          Amount
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewArticles.map((article) => (
                        <tr key={article.id}>
                          <td className="max-w-[24rem] px-4 py-2.5">
                            <p className="truncate text-slate-900">{getArticleTitle(article)}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                            {getArticleQuantity(article)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                            {formatCurrency(getArticleRate(article))}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">
                            {formatCurrency(articleLinkAmount(article))}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => void handleRemoveArticle(article)}
                              disabled={viewSaving || viewLocked}
                              className={rowDangerActionClass}
                              aria-label={`Remove ${getArticleTitle(article)} from this invoice`}
                              title={
                                viewLocked
                                  ? 'Converted proforma invoices cannot be edited'
                                  : 'Remove from this invoice'
                              }
                            >
                              {viewSaving ? (
                                <SpinnerIcon className="h-3.5 w-3.5" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {viewPickerOpen && !viewLocked && (
                <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-3">
                  {viewAvailable.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      There are no unlinked article requests for this client to add.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Available requests ({viewAvailable.length})
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setViewSelectedIds(
                                new Set(viewAvailable.map((article) => article.id))
                              )
                            }
                            className="text-xs font-medium text-brand-700 hover:underline"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewSelectedIds(new Set())}
                            className="text-xs font-medium text-slate-500 hover:underline"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <ul className="max-h-64 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                        {viewAvailable.map((article) => {
                          const checked = viewSelectedIds.has(article.id)
                          return (
                            <li key={article.id}>
                              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleViewSelection(article.id)}
                                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm text-slate-900">
                                    {getArticleTitle(article)}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-slate-500">
                                    {formatDate(article.request_date)} ·{' '}
                                    {getArticleQuantity(article)} ×{' '}
                                    {formatCurrency(getArticleRate(article))} ={' '}
                                    {formatCurrency(articleLinkAmount(article))}
                                  </span>
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>

                      <div className="flex items-center justify-end gap-2">
                        <span className="mr-auto text-xs text-slate-500">
                          {viewSelectedIds.size} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleAddArticles()}
                          disabled={viewSaving || viewSelectedIds.size === 0}
                          className={`${primaryButtonClass} px-3 py-1.5 text-xs`}
                        >
                          {viewSaving ? (
                            <SpinnerIcon className="h-3.5 w-3.5" />
                          ) : (
                            <Plus className="h-3.5 w-3.5" />
                          )}
                          Add to invoice
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={editTarget !== null}
        onClose={() => {
          if (!saving) {
            setEditTarget(null)
            setEditError(null)
          }
        }}
        size="2xl"
        title={`Edit proforma invoice ${editTarget?.pi_number ?? ''}`}
        description="Update the invoice number, date, status and pricing. Linked article requests are not changed."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && <Alert tone="error">{editError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-pi-number" className={labelClass}>
                Proforma invoice number <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-pi-number"
                value={editForm.pi_number}
                onChange={(event) => updateEditForm('pi_number', event.target.value)}
                maxLength={60}
                required
                className={`${inputClass} font-mono`}
              />
            </div>

            <div>
              <label htmlFor="edit-pi-date" className={labelClass}>
                Proforma invoice date <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-pi-date"
                type="date"
                value={editForm.pi_date}
                onChange={(event) => updateEditForm('pi_date', event.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="edit-pi-status" className={labelClass}>
              Status
            </label>
            <select
              id="edit-pi-status"
              value={editForm.status_code}
              onChange={(event) => updateEditForm('status_code', event.target.value)}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {statuses.map((status) => (
                <option key={status.status_code} value={status.status_code}>
                  {status.status_label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-pi-subtotal" className={labelClass}>
                Subtotal (₹)
              </label>
              <input
                id="edit-pi-subtotal"
                type="number"
                min={0}
                step="0.01"
                value={editForm.subtotal}
                onChange={(event) => updateEditForm('subtotal', event.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label htmlFor="edit-pi-tax-rate" className={labelClass}>
                GST rate (%)
              </label>
              <input
                id="edit-pi-tax-rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={editForm.tax_rate}
                onChange={(event) => updateEditForm('tax_rate', event.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <dt className="text-slate-500">GST amount</dt>
            <dd className="text-right font-medium tabular-nums text-slate-900">
              {formatCurrency(editTaxAmount)}
            </dd>
            <dt className="border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
              Grand total
            </dt>
            <dd className="border-t border-slate-200 pt-1.5 text-right text-base font-semibold tabular-nums text-slate-900">
              {formatCurrency(editGrandTotal)}
            </dd>
          </dl>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setEditTarget(null)}
              disabled={saving}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving && <SpinnerIcon className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.pi_number ?? 'proforma invoice'}?`}
        message="This permanently removes the proforma invoice and un-links every article request on it. Those requests return to the pending queue so they can be invoiced again."
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

async function updateWithColumnFallback(
  supabase: ReturnType<typeof createClient>,
  id: string,
  baseBody: Record<string, unknown>
): Promise<unknown | null> {
  const body = { ...baseBody }
  const fallbacks = ['tax_rate', 'tax_amount', 'pi_date', 'status_code']

  for (let attempt = 0; attempt < fallbacks.length + 3; attempt += 1) {
    const { error } = await supabase
      .from('proforma_invoices')
      .update(body)
      .eq('id', id)

    if (!error) {
      return null
    }

    if (!isMissingColumnError(error)) {
      return error
    }

    const missing = extractMissingColumn(error)

    if (missing && missing in body) {
      delete body[missing]
      continue
    }

    const fallback = fallbacks.find((column) => column in body)

    if (!fallback) {
      return error
    }

    delete body[fallback]
  }

  return new Error('The proforma invoice could not be saved after removing unsupported columns.')
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className={`mt-0.5 font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className={`${cardClass} px-4 py-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
          <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="hidden h-4 w-32 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-slate-100 lg:block" />
        </div>
      ))}
    </div>
  )
}

function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}
