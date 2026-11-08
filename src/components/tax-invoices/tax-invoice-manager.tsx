'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Download,
  Eye,
  ListChecks,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react'

import { downloadTaxInvoiceDocument } from '@/actions/invoice-documents'

import {
  SUPABASE_SETUP_MESSAGE,
  badgeClass,
  cardClass,
  formatCurrency,
  formatDate,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  primaryButtonClass,
  rowDangerActionClass,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { TaxInvoiceDialog } from '@/components/tax-invoices/tax-invoice-dialog'
import { Alert } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { IconButton } from '@/components/ui/icon-button'
import { InboxIcon, PlusIcon, SpinnerIcon } from '@/components/ui/icons'
import { Modal } from '@/components/ui/modal'
import { isMissingColumnError, isMissingTableError } from '@/lib/supabase-errors'
import {
  PI_GENERATED_STATUS,
  recalculateTaxInvoicePayment,
  recalculateTaxInvoiceTotals,
} from '@/lib/invoice-links'
import {
  effectiveTaxStatus,
  parseLinkedProformaIds,
  roundMoney,
  toNumber,
  type ProformaForTaxInvoice,
  type TaxClientOption,
  type TaxInvoiceRow,
  type TaxStatusOption,
} from '@/lib/tax-invoices'
import { createClient } from '@/utils/supabase/client'

type InvoiceWithLinks = TaxInvoiceRow & { tax_invoice_number: string | null }

type LinkedProforma = ProformaForTaxInvoice

const STATUS_TONES: Record<string, string> = {
  UNPAID: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  PARTIALLY_PAID: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  OVERDUE: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}

export function TaxInvoiceManager() {
  const [clients, setClients] = useState<TaxClientOption[]>([])
  const [statuses, setStatuses] = useState<TaxStatusOption[]>([])
  const [invoices, setInvoices] = useState<InvoiceWithLinks[]>([])

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('status')
    const client = params.get('client')
    if (status) setStatusFilter(status)
    if (client) setClientFilter(client)
  }, [])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogInvoice, setDialogInvoice] = useState<InvoiceWithLinks | null>(null)

  const [viewTarget, setViewTarget] = useState<InvoiceWithLinks | null>(null)
  const [viewProformas, setViewProformas] = useState<LinkedProforma[]>([])
  const [viewAvailable, setViewAvailable] = useState<LinkedProforma[]>([])
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState<string | null>(null)
  const [viewPickerOpen, setViewPickerOpen] = useState(false)
  const [viewSelectedIds, setViewSelectedIds] = useState<Set<string>>(new Set())
  const [viewSaving, setViewSaving] = useState(false)
  const [viewActionError, setViewActionError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<InvoiceWithLinks | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

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
    map.set('OVERDUE', 'Overdue')
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
          .from('tax_invoices')
          .select('*')
          .order('invoice_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('tax_status_master')
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

      // The status master is optional: statuses are stored as plain codes.
      const loadedStatuses = statusesResult.error
        ? []
        : ((statusesResult.data ?? []) as TaxStatusOption[])

      setClients((clientsResult.data ?? []) as TaxClientOption[])
      setInvoices((invoicesResult.data ?? []) as InvoiceWithLinks[])
      setStatuses(
        loadedStatuses.length > 0
          ? loadedStatuses
          : [
              { status_code: 'UNPAID', status_label: 'Unpaid', display_order: 1 },
              {
                status_code: 'PARTIALLY_PAID',
                status_label: 'Partially paid',
                display_order: 2,
              },
              { status_code: 'PAID', status_label: 'Paid', display_order: 3 },
            ]
      )
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load tax invoices.'))
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

      if (statusFilter && effectiveTaxStatus(invoice) !== statusFilter) {
        return false
      }

      if (!term) {
        return true
      }

      const status = effectiveTaxStatus(invoice)

      return [
        invoice.tax_invoice_number ?? '',
        invoice.client_id ? clientNames.get(invoice.client_id) ?? '' : '',
        status,
        statusLabels.get(status) ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [clientFilter, clientNames, invoices, query, statusFilter, statusLabels])

  const summary = useMemo(() => {
    let invoiced = 0
    let collected = 0
    let outstanding = 0
    let overdue = 0

    for (const invoice of invoices) {
      const total = toNumber(invoice.grand_total)
      const paid = Math.min(total, Math.max(0, toNumber(invoice.amount_paid)))
      const status = effectiveTaxStatus(invoice)

      invoiced += total
      collected += paid
      outstanding += Math.max(0, total - paid)

      if (status === 'OVERDUE') {
        overdue += Math.max(0, total - paid)
      }
    }

    return {
      invoiced: roundMoney(invoiced),
      collected: roundMoney(collected),
      outstanding: roundMoney(outstanding),
      overdue: roundMoney(overdue),
    }
  }, [invoices])

  const refreshViewTarget = useCallback(async (invoiceId: string) => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('tax_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle()

    if (!error && data) {
      setViewTarget(data as InvoiceWithLinks)
    }
  }, [])

  useEffect(() => {
    if (!viewTarget) {
      setViewProformas([])
      setViewAvailable([])
      setViewError(null)
      setViewActionError(null)
      setViewPickerOpen(false)
      setViewSelectedIds(new Set())
      return
    }

    let cancelled = false
    const invoice = viewTarget

    async function loadLinkedProformas() {
      setViewLoading(true)
      setViewError(null)

      try {
        const supabase = createClient()
        let linked: LinkedProforma[] = []

        const { data, error } = await supabase
          .from('proforma_invoices')
          .select('*')
          .eq('tax_invoice_id', invoice.id)
          .order('created_at', { ascending: true })

        if (error) {
          if (!isMissingColumnError(error)) {
            throw error
          }
        } else {
          linked = (data ?? []) as LinkedProforma[]
        }

        // Rows created before the link migration only store the ids in
        // `document_content`; merge them in when native links are absent.
        if (linked.length === 0) {
          const fallbackIds = parseLinkedProformaIds(invoice.document_content)

          if (fallbackIds.length > 0) {
            const { data: fallbackRows, error: fallbackError } = await supabase
              .from('proforma_invoices')
              .select('*')
              .in('id', fallbackIds)
              .order('created_at', { ascending: true })

            if (fallbackError) {
              throw fallbackError
            }

            linked = (fallbackRows ?? []) as LinkedProforma[]
          }
        }

        let available: LinkedProforma[] = []

        if (invoice.client_id) {
          const { data: availableRows, error: availableError } = await supabase
            .from('proforma_invoices')
            .select('*')
            .eq('client_id', invoice.client_id)
            .is('tax_invoice_id', null)
            .order('pi_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false })

          if (availableError) {
            if (!isMissingColumnError(availableError)) {
              throw availableError
            }
          } else {
            available = ((availableRows ?? []) as LinkedProforma[]).filter(
              (proforma) => (proforma.status_code ?? '').toUpperCase() !== 'CANCELLED'
            )
          }
        }

        if (!cancelled) {
          setViewProformas(linked)
          setViewAvailable(available)
        }
      } catch (error) {
        if (!cancelled) {
          setViewProformas([])
          setViewAvailable([])
          setViewError(
            getErrorMessage(error, 'Unable to load the proforma invoices for this tax invoice.')
          )
        }
      } finally {
        if (!cancelled) {
          setViewLoading(false)
        }
      }
    }

    void loadLinkedProformas()

    return () => {
      cancelled = true
    }
  }, [viewTarget])

  async function handleRemoveProforma(proforma: LinkedProforma) {
    if (!viewTarget) {
      return
    }

    setViewSaving(true)
    setViewActionError(null)

    try {
      const supabase = createClient()
      const remainingIds = viewProformas
        .filter((row) => row.id !== proforma.id)
        .map((row) => row.id)

      const { error: unlinkError } = await supabase
        .from('proforma_invoices')
        .update({ tax_invoice_id: null, status_code: 'PARTIALLY_BILLED' })
        .eq('id', proforma.id)

      if (unlinkError && !isMissingColumnError(unlinkError)) {
        throw unlinkError
      }

      if (unlinkError && isMissingColumnError(unlinkError)) {
        const { error: statusError } = await supabase
          .from('proforma_invoices')
          .update({ status_code: 'PARTIALLY_BILLED' })
          .eq('id', proforma.id)

        if (statusError) {
          throw statusError
        }
      }

      const { error: articleError } = await supabase
        .from('article_requests')
        .update({ tax_invoice_id: null, status_code: PI_GENERATED_STATUS })
        .eq('proforma_invoice_id', proforma.id)

      if (articleError && !isMissingColumnError(articleError)) {
        throw articleError
      }

      // Legacy invoices only carry the proforma ids inside document_content.
      const fallbackIds = parseLinkedProformaIds(viewTarget.document_content)
      if (fallbackIds.length > 0) {
        const nextContent = rewriteLinkedProformaIds(viewTarget.document_content, remainingIds)
        if (nextContent !== viewTarget.document_content) {
          const { error: contentError } = await supabase
            .from('tax_invoices')
            .update({ document_content: nextContent })
            .eq('id', viewTarget.id)

          if (contentError && !isMissingColumnError(contentError)) {
            throw contentError
          }
        }
      }

      await recalculateTaxInvoiceTotals(supabase, viewTarget.id)
      await recalculateTaxInvoicePayment(supabase, viewTarget.id)
      await refreshViewTarget(viewTarget.id)
      await loadData({ silent: true })
      setNotice({
        tone: 'success',
        message: `${proforma.pi_number ?? 'The proforma invoice'} was removed from this tax invoice. Its articles remain on the proforma invoice.`,
      })
    } catch (error) {
      setViewActionError(
        getErrorMessage(error, 'Unable to remove the proforma invoice from this tax invoice.')
      )
    } finally {
      setViewSaving(false)
    }
  }

  async function handleAddProformas() {
    if (!viewTarget || viewSelectedIds.size === 0) {
      return
    }

    setViewSaving(true)
    setViewActionError(null)

    try {
      const supabase = createClient()
      const ids = Array.from(viewSelectedIds)

      const { error: linkError } = await supabase
        .from('proforma_invoices')
        .update({
          tax_invoice_id: viewTarget.id,
          status_code: 'TAX_INVOICE_GENERATED',
        })
        .in('id', ids)

      if (linkError && !isMissingColumnError(linkError)) {
        throw linkError
      }

      if (linkError && isMissingColumnError(linkError)) {
        const { error: statusError } = await supabase
          .from('proforma_invoices')
          .update({ status_code: 'TAX_INVOICE_GENERATED' })
          .in('id', ids)

        if (statusError) {
          throw statusError
        }
      }

      const { error: articleError } = await supabase
        .from('article_requests')
        .update({ tax_invoice_id: viewTarget.id, status_code: PI_GENERATED_STATUS })
        .in('proforma_invoice_id', ids)

      if (articleError && !isMissingColumnError(articleError)) {
        throw articleError
      }

      await recalculateTaxInvoiceTotals(supabase, viewTarget.id)
      await recalculateTaxInvoicePayment(supabase, viewTarget.id)
      setViewSelectedIds(new Set())
      setViewPickerOpen(false)
      await refreshViewTarget(viewTarget.id)
      await loadData({ silent: true })
      setNotice({
        tone: 'success',
        message: `${ids.length} proforma invoice${ids.length === 1 ? '' : 's'} added to this tax invoice.`,
      })
    } catch (error) {
      setViewActionError(
        getErrorMessage(error, 'Unable to add the selected proforma invoices to this tax invoice.')
      )
    } finally {
      setViewSaving(false)
    }
  }

  function toggleViewSelection(proformaId: string) {
    setViewSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(proformaId)) {
        next.delete(proformaId)
      } else {
        next.add(proformaId)
      }
      return next
    })
    setViewActionError(null)
  }

  function openCreateDialog() {
    setDialogInvoice(null)
    setDialogOpen(true)
  }

  function openEditDialog(invoice: InvoiceWithLinks) {
    setDialogInvoice(invoice)
    setDialogOpen(true)
  }

  async function handleSaved(message: string) {
    setNotice({ tone: 'success', message })
    await loadData({ silent: true })
  }

  async function handleDownloadWord(invoice: InvoiceWithLinks) {
    if (downloadingId) {
      return
    }

    setDownloadingId(invoice.id)
    setNotice(null)

    try {
      const result = await downloadTaxInvoiceDocument(invoice.id)

      if (!result.ok) {
        setNotice({ tone: 'error', message: result.error })
        return
      }

      downloadBase64(result.base64, result.filename, result.mimeType)
      setNotice({
        tone: 'success',
        message: `Downloaded ${
          invoice.tax_invoice_number?.trim() || 'the tax invoice'
        } as a Word document.`,
      })
    } catch (downloadError) {
      setNotice({
        tone: 'error',
        message: getErrorMessage(
          downloadError,
          'Could not generate the tax invoice document.'
        ),
      })
    } finally {
      setDownloadingId(null)
    }
  }

  function downloadBase64(base64: string, filename: string, mimeType: string) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    const blob = new Blob([bytes], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
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

    const supabase = createClient()
    const invoiceId = deleteTarget.id
    const label = deleteTarget.tax_invoice_number?.trim() || 'Tax invoice'

    let linkedProformas: LinkedProforma[] = []

    try {
      // Find linked proformas through the native column, then the fallback.
      const { data, error } = await supabase
        .from('proforma_invoices')
        .select('id, pi_number, pi_date, invoice_date, status_code')
        .eq('tax_invoice_id', invoiceId)

      if (error) {
        if (!isMissingColumnError(error)) {
          throw error
        }
      } else {
        linkedProformas = (data ?? []) as LinkedProforma[]
      }

      if (linkedProformas.length === 0) {
        const fallbackIds = parseLinkedProformaIds(deleteTarget.document_content)

        if (fallbackIds.length > 0) {
          const { data: fallbackRows, error: fallbackError } = await supabase
            .from('proforma_invoices')
            .select('id, pi_number, pi_date, invoice_date, status_code')
            .in('id', fallbackIds)

          if (fallbackError) {
            throw fallbackError
          }

          linkedProformas = (fallbackRows ?? []) as LinkedProforma[]
        }
      }

      if (linkedProformas.length > 0) {
        const ids = linkedProformas.map((proforma) => proforma.id)

        const { error: unlinkError } = await supabase
          .from('proforma_invoices')
          .update({
            tax_invoice_id: null,
            status_code: 'PARTIALLY_BILLED',
          })
          .in('id', ids)

        if (unlinkError) {
          if (!isMissingColumnError(unlinkError)) {
            throw unlinkError
          }

          const { error: statusError } = await supabase
            .from('proforma_invoices')
            .update({ status_code: 'PARTIALLY_BILLED' })
            .in('id', ids)

          if (statusError) {
            throw statusError
          }
        }
      }

      // Article requests point at the tax invoice directly in the base schema.
      const { error: articleError } = await supabase
        .from('article_requests')
        .update({ tax_invoice_id: null })
        .eq('tax_invoice_id', invoiceId)

      if (articleError && !isMissingColumnError(articleError)) {
        throw articleError
      }

      // Remove allocations first so the receipt balances stay consistent.
      const { error: allocationError } = await supabase
        .from('payment_allocations')
        .delete()
        .eq('tax_invoice_id', invoiceId)

      if (allocationError && !isMissingTableError(allocationError)) {
        throw allocationError
      }

      const { error: deleteErrorResult } = await supabase
        .from('tax_invoices')
        .delete()
        .eq('id', invoiceId)

      if (deleteErrorResult) {
        throw deleteErrorResult
      }

      setNotice({
        tone: 'success',
        message: `${label} was deleted${
          linkedProformas.length > 0
            ? ` and ${linkedProformas.length} proforma invoice${
                linkedProformas.length === 1 ? '' : 's'
              } returned to partially billed`
            : ''
        }.`,
      })
      setDeleteTarget(null)
      await loadData({ silent: true })
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'Unable to delete the tax invoice.'))
    } finally {
      setDeleting(false)
    }
  }

  const outstandingCount = invoices.filter(
    (invoice) => effectiveTaxStatus(invoice) !== 'PAID'
  ).length

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Invoicing
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Tax Invoices</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Raise tax invoices manually or convert open proforma invoices, then track payments and
            outstanding balances.
          </p>
        </div>

        <IconButton
          label="New tax invoice"
          icon={<Plus />}
          variant="primary"
          onClick={openCreateDialog}
        />
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Invoiced value"
          value={formatCurrency(summary.invoiced)}
          hint={`${invoices.length} tax invoice${invoices.length === 1 ? '' : 's'}`}
        />
        <SummaryCard
          label="Collected"
          value={formatCurrency(summary.collected)}
          hint="Payments allocated"
        />
        <SummaryCard
          label="Outstanding"
          value={formatCurrency(summary.outstanding)}
          hint={`${outstandingCount} open invoice${outstandingCount === 1 ? '' : 's'}`}
        />
        <SummaryCard
          label="Overdue"
          value={formatCurrency(summary.overdue)}
          hint="Flagged as overdue"
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
              aria-label="Search tax invoices"
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="ti-client-filter">
              Filter by client
            </label>
            <select
              id="ti-client-filter"
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

            <label className="sr-only" htmlFor="ti-status-filter">
              Filter by status
            </label>
            <select
              id="ti-status-filter"
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
              <option value="OVERDUE">Overdue</option>
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
            <p className="text-sm font-semibold text-red-700">Could not load tax invoices</p>
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
              {invoices.length === 0 ? 'No tax invoices yet' : 'No matching invoices'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {invoices.length === 0
                ? 'Create one manually or convert open proforma invoices into a tax invoice.'
                : 'Try a different search or clear the filters.'}
            </p>
            {invoices.length === 0 && (
              <button
                type="button"
                onClick={openCreateDialog}
                className={`${secondaryButtonClass} mt-4`}
              >
                <PlusIcon className="h-4 w-4" />
                New tax invoice
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1150px] divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Tax invoices</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Tax invoice number
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Client
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
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Amount paid
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((invoice) => {
                  const status = effectiveTaxStatus(invoice)

                  return (
                    <tr key={invoice.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="font-mono text-xs font-medium text-slate-700">
                          {invoice.tax_invoice_number?.trim() ||
                            invoice.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDate(invoice.invoice_date ?? invoice.created_at)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {invoice.client_id
                          ? clientNames.get(invoice.client_id) ?? 'Unknown client'
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(invoice.subtotal)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(invoice.tax_total)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {formatCurrency(invoice.grand_total)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`${badgeClass} ${
                            STATUS_TONES[status] ?? 'bg-slate-100 text-slate-600 ring-slate-500/20'
                          }`}
                          title={statusLabels.get(status) ?? status}
                        >
                          {status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(toNumber(invoice.amount_paid))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label={`Manage proforma invoices on ${
                              invoice.tax_invoice_number ?? 'tax invoice'
                            }`}
                            tooltipText="Proformas: add or remove linked proforma invoices"
                            tooltip="native"
                            variant="ghost"
                            size="sm"
                            icon={<ListChecks />}
                            onClick={() => setViewTarget(invoice)}
                          />
                          <IconButton
                            label={`View ${invoice.tax_invoice_number ?? 'tax invoice'}`}
                            tooltipText="View invoice"
                            tooltip="native"
                            variant="ghost"
                            size="sm"
                            icon={<Eye />}
                            onClick={() => setViewTarget(invoice)}
                          />
                          <IconButton
                            label={`Download ${
                              invoice.tax_invoice_number ?? 'tax invoice'
                            } as Word`}
                            tooltipText={
                              downloadingId === invoice.id
                                ? 'Generating Word document…'
                                : 'Download Word (.docx)'
                            }
                            tooltip="native"
                            variant="ghost"
                            size="sm"
                            icon={
                              downloadingId === invoice.id ? (
                                <SpinnerIcon className="h-4 w-4" />
                              ) : (
                                <Download />
                              )
                            }
                            disabled={downloadingId !== null}
                            onClick={() => void handleDownloadWord(invoice)}
                          />
                          <IconButton
                            label={`Edit ${invoice.tax_invoice_number ?? 'tax invoice'}`}
                            tooltipText="Edit invoice details"
                            tooltip="native"
                            variant="ghost"
                            size="sm"
                            icon={<Pencil />}
                            onClick={() => openEditDialog(invoice)}
                          />
                          <IconButton
                            label={`Delete ${invoice.tax_invoice_number ?? 'tax invoice'}`}
                            tooltipText="Delete invoice"
                            tooltip="native"
                            variant="danger"
                            size="sm"
                            icon={<Trash2 />}
                            onClick={() => {
                              setDeleteError(null)
                              setDeleteTarget(invoice)
                            }}
                          />
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

      <TaxInvoiceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        invoice={dialogInvoice}
        clients={clients}
        statuses={statuses}
        existingNumbers={invoices.map((invoice) => invoice.tax_invoice_number)}
        onSaved={handleSaved}
        onManageProformas={
          dialogInvoice
            ? () => {
                const target = dialogInvoice
                setDialogOpen(false)
                setViewTarget(target)
              }
            : undefined
        }
      />

      <Modal
        open={viewTarget !== null}
        onClose={() => setViewTarget(null)}
        size="4xl"
        title={`Tax invoice ${viewTarget?.tax_invoice_number ?? ''}`}
        description="Invoice totals, payment position and the proforma invoices it was raised from."
      >
        {viewTarget && (
          <div className="space-y-5">
            <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Invoice number" value={viewTarget.tax_invoice_number ?? '—'} mono />
              <Detail label="Invoice date" value={formatDate(viewTarget.invoice_date)} />
              <Detail
                label="Client"
                value={
                  viewTarget.client_id
                    ? clientNames.get(viewTarget.client_id) ?? 'Unknown client'
                    : '—'
                }
              />
              <Detail
                label="Status"
                value={statusLabels.get(effectiveTaxStatus(viewTarget)) ?? effectiveTaxStatus(viewTarget)}
              />
              <Detail label="Subtotal" value={formatCurrency(viewTarget.subtotal)} />
              <Detail label="GST (18%)" value={formatCurrency(viewTarget.tax_total)} />
              <Detail label="Grand total" value={formatCurrency(viewTarget.grand_total)} />
              <Detail label="Amount paid" value={formatCurrency(toNumber(viewTarget.amount_paid))} />
            </dl>

            <div className="rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">Outstanding balance</span>
                <span className="text-base font-semibold tabular-nums text-slate-900">
                  {formatCurrency(
                    Math.max(
                      0,
                      toNumber(viewTarget.grand_total) - toNumber(viewTarget.amount_paid)
                    )
                  )}
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Proforma invoices ({viewProformas.length})
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Remove a proforma invoice to send it back to the partially billed queue, or add
                    another open proforma invoice for the same client.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setViewPickerOpen((open) => !open)
                    setViewActionError(null)
                  }}
                  className={`${secondaryButtonClass} px-2.5 py-1.5 text-xs`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {viewPickerOpen ? 'Close picker' : 'Add proformas'}
                </button>
              </div>

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
              ) : viewProformas.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  This invoice was created manually; no proforma invoices are linked.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <caption className="sr-only">Linked proforma invoices</caption>
                    <thead className="bg-white text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-2.5">
                          PI number
                        </th>
                        <th scope="col" className="px-4 py-2.5">
                          PI date
                        </th>
                        <th scope="col" className="px-4 py-2.5">
                          Status
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          Total
                        </th>
                        <th scope="col" className="px-4 py-2.5 text-right">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {viewProformas.map((proforma) => (
                        <tr key={proforma.id}>
                          <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700">
                            {proforma.pi_number?.trim() || proforma.id.slice(0, 8).toUpperCase()}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {formatDate(proforma.pi_date ?? proforma.invoice_date)}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">
                            {proforma.status_code ?? '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                            {formatCurrency(proforma.grand_total)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => void handleRemoveProforma(proforma)}
                              disabled={viewSaving}
                              className={rowDangerActionClass}
                              aria-label={`Remove ${proforma.pi_number ?? 'proforma invoice'} from this tax invoice`}
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

              {viewPickerOpen && (
                <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-3">
                  {viewAvailable.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      There are no open proforma invoices for this client to add.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Available proforma invoices ({viewAvailable.length})
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setViewSelectedIds(
                                new Set(viewAvailable.map((proforma) => proforma.id))
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
                        {viewAvailable.map((proforma) => (
                          <li key={proforma.id}>
                            <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={viewSelectedIds.has(proforma.id)}
                                onChange={() => toggleViewSelection(proforma.id)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-mono text-xs font-medium text-slate-900">
                                  {proforma.pi_number?.trim() ||
                                    proforma.id.slice(0, 8).toUpperCase()}
                                </span>
                                <span className="mt-0.5 block text-xs text-slate-500">
                                  {formatDate(proforma.pi_date ?? proforma.invoice_date)} ·{' '}
                                  {formatCurrency(proforma.grand_total)}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>

                      <div className="flex items-center justify-end gap-2">
                        <span className="mr-auto text-xs text-slate-500">
                          {viewSelectedIds.size} selected
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleAddProformas()}
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.tax_invoice_number ?? 'tax invoice'}?`}
        message="This permanently removes the tax invoice, its payment allocations, and un-links any converted proforma invoices so they can be billed again."
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

function rewriteLinkedProformaIds(
  documentContent: string | null | undefined,
  ids: string[]
): string | null {
  if (!documentContent) {
    return documentContent ?? null
  }

  try {
    const parsed = JSON.parse(documentContent) as Record<string, unknown>

    if (parsed.source !== 'PROFORMA') {
      return documentContent
    }

    return JSON.stringify({ ...parsed, proforma_invoice_ids: ids })
  } catch {
    return documentContent
  }
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
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
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
