'use client'

import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Coins,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react'

import {
  AllocatePaymentDialog,
  type AllocationRow,
  type ReceiptForAllocation,
} from '@/components/payment-receipts/allocate-payment-dialog'
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
  roundMoney,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { IconButton } from '@/components/ui/icon-button'
import { Modal } from '@/components/ui/modal'
import { SpinnerIcon } from '@/components/ui/icons'
import { isMissingTableError } from '@/lib/supabase-errors'
import { recalculateTaxInvoicePayment } from '@/lib/invoice-links'
import { createClient } from '@/utils/supabase/client'

type ClientRow = { id: string; company_name: string }

type ReceiptRow = {
  id: string
  receipt_number: string
  receipt_date: string | null
  client_id: string | null
  amount_received: number | string | null
  payment_mode: string | null
  reference_no: string | null
  status_code: string | null
  created_at: string | null
}

type FormState = {
  receipt_number: string
  auto_number: boolean
  client_id: string
  receipt_date: string
  amount_received: string
  payment_mode: string
  reference_no: string
}

type DialogState = { mode: 'create' } | { mode: 'edit'; row: ReceiptRow }

const PAYMENT_MODES = [
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CASH', label: 'Cash' },
] as const

const MODE_LABELS = new Map<string, string>(
  PAYMENT_MODES.map((mode) => [mode.value, mode.label])
)

const EPSILON = 0.005

const EMPTY_FORM: FormState = {
  receipt_number: '',
  auto_number: true,
  client_id: '',
  receipt_date: today(),
  amount_received: '',
  payment_mode: 'BANK_TRANSFER',
  reference_no: '',
}

export function PaymentReceiptManager() {
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [allocationsAvailable, setAllocationsAvailable] = useState(true)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ReceiptRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [allocateTarget, setAllocateTarget] = useState<ReceiptRow | null>(null)

  const clientNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const client of clients) {
      map.set(client.id, client.company_name)
    }
    return map
  }, [clients])

  const appliedByReceipt = useMemo(() => {
    const map = new Map<string, number>()

    for (const allocation of allocations) {
      const current = map.get(allocation.receipt_id) ?? 0
      map.set(allocation.receipt_id, current + Number(allocation.amount ?? 0))
    }

    for (const [key, value] of map) {
      map.set(key, roundMoney(value))
    }

    return map
  }, [allocations])

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

      const [receiptsResult, clientsResult, allocationsResult] = await Promise.all([
        supabase
          .from('payment_receipts')
          .select('*')
          .order('receipt_date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase.from('clients').select('id, company_name').order('company_name', { ascending: true }),
        supabase.from('payment_allocations').select('*'),
      ])

      if (receiptsResult.error) {
        throw receiptsResult.error
      }

      if (clientsResult.error) {
        throw clientsResult.error
      }

      let tableAvailable = true

      if (allocationsResult.error) {
        if (isMissingTableError(allocationsResult.error)) {
          tableAvailable = false
        } else {
          throw allocationsResult.error
        }
      }

      setReceipts((receiptsResult.data ?? []) as ReceiptRow[])
      setClients((clientsResult.data ?? []) as ClientRow[])
      setAllocations(tableAvailable ? ((allocationsResult.data ?? []) as AllocationRow[]) : [])
      setAllocationsAvailable(tableAvailable)
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load payment receipts.'))
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredReceipts = useMemo(() => {
    const term = query.trim().toLowerCase()

    return receipts.filter((receipt) => {
      if (clientFilter && receipt.client_id !== clientFilter) {
        return false
      }

      if (modeFilter && (receipt.payment_mode ?? '') !== modeFilter) {
        return false
      }

      if (!term) {
        return true
      }

      return [
        receipt.receipt_number,
        receipt.reference_no ?? '',
        receipt.payment_mode ? modeLabel(receipt.payment_mode) : '',
        clientNames.get(receipt.client_id ?? '') ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [clientFilter, clientNames, modeFilter, query, receipts])

  const summary = useMemo(() => {
    const totalCollected = roundMoney(
      receipts.reduce((total, receipt) => total + toNumber(receipt.amount_received), 0)
    )

    const totalApplied = roundMoney(
      allocations.reduce((total, allocation) => total + toNumber(allocation.amount), 0)
    )

    const unapplied = roundMoney(Math.max(0, totalCollected - totalApplied))

    const month = today().slice(0, 7)
    const monthReceipts = receipts.filter(
      (receipt) => (receipt.receipt_date ?? receipt.created_at ?? '').slice(0, 7) === month
    )
    const monthTotal = roundMoney(
      monthReceipts.reduce((total, receipt) => total + toNumber(receipt.amount_received), 0)
    )

    return { totalCollected, unapplied, monthCount: monthReceipts.length, monthTotal }
  }, [allocations, receipts])

  function openCreateDialog() {
    const date = today()

    setForm({
      ...EMPTY_FORM,
      client_id: clients[0]?.id ?? '',
      receipt_date: date,
      receipt_number: nextReceiptNumber(receipts, date),
    })
    setFormError(null)
    setDialog({ mode: 'create' })
  }

  function openEditDialog(row: ReceiptRow) {
    setForm({
      receipt_number: row.receipt_number,
      auto_number: false,
      client_id: row.client_id ?? '',
      receipt_date: row.receipt_date?.slice(0, 10) ?? today(),
      amount_received: String(toNumber(row.amount_received)),
      payment_mode: row.payment_mode ?? 'BANK_TRANSFER',
      reference_no: row.reference_no ?? '',
    })
    setFormError(null)
    setDialog({ mode: 'edit', row })
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleAutoToggle(checked: boolean) {
    setForm((current) => ({
      ...current,
      auto_number: checked,
      receipt_number: checked
        ? nextReceiptNumber(receipts, current.receipt_date || today())
        : current.receipt_number,
    }))
  }

  function handleDateChange(value: string) {
    setForm((current) => ({
      ...current,
      receipt_date: value,
      receipt_number: current.auto_number ? nextReceiptNumber(receipts, value || today()) : current.receipt_number,
    }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!dialog) {
      return
    }

    const amount = Number(form.amount_received)

    if (!form.client_id) {
      setFormError('Select the client who made the payment.')
      return
    }

    if (!form.receipt_date) {
      setFormError('Choose the receipt date.')
      return
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Amount received must be greater than zero.')
      return
    }

    const receiptNumber = form.receipt_number.trim() || nextReceiptNumber(receipts, form.receipt_date)

    if (!receiptNumber) {
      setFormError('Enter or generate a receipt number.')
      return
    }

    if (!hasSupabaseEnv()) {
      setFormError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      receipt_number: receiptNumber,
      receipt_date: form.receipt_date,
      client_id: form.client_id,
      amount_received: roundMoney(amount),
      payment_mode: form.payment_mode,
      reference_no: form.reference_no.trim() || null,
    }

    try {
      const supabase = createClient()

      if (dialog.mode === 'edit') {
        const { error } = await supabase
          .from('payment_receipts')
          .update(payload)
          .eq('id', dialog.row.id)

        if (error) {
          throw error
        }
      } else {
        const { error } = await supabase.from('payment_receipts').insert(payload)

        if (error) {
          throw error
        }
      }

      setDialog(null)
      setNotice({
        tone: 'success',
        message:
          dialog.mode === 'edit'
            ? `Receipt ${receiptNumber} was updated.`
            : `Receipt ${receiptNumber} was logged for ${formatCurrency(payload.amount_received)}.`,
      })
      await loadData({ silent: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Unable to save the payment receipt.'))
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

      // Collect the affected invoices before deleting so their paid totals can
      // be recomputed afterwards.
      let affectedInvoiceIds: string[] = []

      if (allocationsAvailable) {
        const { data: allocationRows } = await supabase
          .from('payment_allocations')
          .select('tax_invoice_id')
          .eq('receipt_id', deleteTarget.id)

        affectedInvoiceIds = Array.from(
          new Set(
            ((allocationRows ?? []) as Array<{ tax_invoice_id: string | null }>)
              .map((row) => row.tax_invoice_id)
              .filter((id): id is string => Boolean(id))
          )
        )

        // Remove allocations first so the receipt can be deleted cleanly.
        const { error: allocationError } = await supabase
          .from('payment_allocations')
          .delete()
          .eq('receipt_id', deleteTarget.id)

        if (allocationError && !isMissingTableError(allocationError)) {
          throw allocationError
        }
      }

      const { error } = await supabase
        .from('payment_receipts')
        .delete()
        .eq('id', deleteTarget.id)

      if (error) {
        throw error
      }

      for (const invoiceId of affectedInvoiceIds) {
        try {
          await recalculateTaxInvoicePayment(supabase, invoiceId)
        } catch {
          // Best effort: the receipt is already gone.
        }
      }

      setNotice({ tone: 'success', message: `Receipt ${deleteTarget.receipt_number} was deleted.` })
      setDeleteTarget(null)
      await loadData({ silent: true })
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'Unable to delete the payment receipt.'))
    } finally {
      setDeleting(false)
    }
  }

  const editingReceipt: ReceiptRow | null = dialog?.mode === 'edit' ? dialog.row : null

  const allocateReceipt: ReceiptForAllocation | null = allocateTarget
    ? {
        id: allocateTarget.id,
        receipt_number: allocateTarget.receipt_number,
        receipt_date: allocateTarget.receipt_date,
        client_id: allocateTarget.client_id,
        client_name: allocateTarget.client_id
          ? clientNames.get(allocateTarget.client_id) ?? 'Unknown client'
          : 'Unknown client',
        amount_received: toNumber(allocateTarget.amount_received),
      }
    : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Payment Receipts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Record client payments, track what is still unapplied and reconcile receipts against
            outstanding tax invoices.
          </p>
        </div>

        <IconButton
          label="Log payment receipt"
          tooltipText={
            !loading && clients.length === 0
              ? 'Add a client before logging a receipt'
              : 'Log payment receipt'
          }
          icon={<Plus />}
          variant="primary"
          onClick={openCreateDialog}
          disabled={loading || clients.length === 0}
        />
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      {!allocationsAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Payment allocation is not enabled yet</p>
          <p className="mt-1 text-amber-700">
            The <code className="rounded bg-amber-100 px-1">payment_allocations</code> table is
            missing. Apply the latest Supabase migration to reconcile receipts against tax
            invoices. Receipt entry itself works without it.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Total collected"
          value={formatCurrency(summary.totalCollected)}
          hint={`${receipts.length} receipt${receipts.length === 1 ? '' : 's'} recorded`}
        />
        <SummaryCard
          label="Unapplied payments"
          value={formatCurrency(summary.unapplied)}
          hint={
            allocationsAvailable
              ? 'Available to reconcile'
              : 'Allocation tracking not enabled'
          }
          tone={summary.unapplied > EPSILON ? 'amber' : 'default'}
        />
        <SummaryCard
          label="Receipts this month"
          value={String(summary.monthCount)}
          hint={formatCurrency(summary.monthTotal)}
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
              placeholder="Search receipt no, client or reference"
              aria-label="Search payment receipts"
              className={`${inputClass} pl-9`}
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="receipt-client-filter">
              Filter by client
            </label>
            <select
              id="receipt-client-filter"
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

            <label className="sr-only" htmlFor="receipt-mode-filter">
              Filter by payment mode
            </label>
            <select
              id="receipt-mode-filter"
              value={modeFilter}
              onChange={(event) => setModeFilter(event.target.value)}
              className={`${inputClass} sm:w-44`}
            >
              <option value="">All modes</option>
              {PAYMENT_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
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

        {loadError && receipts.length > 0 && (
          <div className="border-b border-slate-200 px-4 py-3">
            <Alert tone="error" onDismiss={() => setLoadError(null)}>
              {loadError}
            </Alert>
          </div>
        )}

        {loading ? (
          <TableSkeleton />
        ) : loadError && receipts.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-red-700">Could not load payment receipts</p>
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
        ) : filteredReceipts.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Wallet className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              {receipts.length === 0 ? 'No payment receipts yet' : 'No matching receipts'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {receipts.length === 0
                ? 'Log the first client payment to start reconciling invoices.'
                : 'Try a different search or clear the filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Payment receipts</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Receipt
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Mode
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Reference
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceipts.map((receipt) => {
                  const status = receiptStatus(
                    receipt,
                    appliedByReceipt.get(receipt.id) ?? 0
                  )
                  const amount = toNumber(receipt.amount_received)
                  const applied = appliedByReceipt.get(receipt.id) ?? 0
                  const remaining = roundMoney(Math.max(0, amount - applied))

                  return (
                    <tr key={receipt.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="flex items-center gap-2 font-medium text-slate-900">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                            <Wallet className="h-4 w-4" />
                          </span>
                          {receipt.receipt_number}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDate(receipt.receipt_date ?? receipt.created_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {receipt.client_id
                          ? clientNames.get(receipt.client_id) ?? 'Unknown client'
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <p className="font-medium tabular-nums text-slate-900">
                          {formatCurrency(amount)}
                        </p>
                        {applied > 0 && (
                          <p className="text-xs tabular-nums text-slate-500">
                            {formatCurrency(applied)} applied
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {modeLabel(receipt.payment_mode)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {receipt.reference_no ? (
                          <span className="break-all">{receipt.reference_no}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`${badgeClass} ${status.tone}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            label={`Allocations for ${receipt.receipt_number}`}
                            tooltipText={
                              !receipt.client_id
                                ? 'This receipt has no client'
                                : remaining <= EPSILON
                                  ? 'Fully applied – open to review or remove allocations'
                                  : 'Apply to tax invoices or change allocations'
                            }
                            tooltip="native"
                            variant="ghost"
                            size="sm"
                            icon={<Coins />}
                            disabled={!receipt.client_id}
                            onClick={() => setAllocateTarget(receipt)}
                          />
                          <IconButton
                            label={`Edit ${receipt.receipt_number}`}
                            tooltipText="Edit receipt"
                            tooltip="native"
                            variant="ghost"
                            size="sm"
                            icon={<Pencil />}
                            onClick={() => openEditDialog(receipt)}
                          />
                          <IconButton
                            label={`Delete ${receipt.receipt_number}`}
                            tooltipText="Delete receipt"
                            tooltip="native"
                            variant="danger"
                            size="sm"
                            icon={<Trash2 />}
                            onClick={() => {
                              setDeleteError(null)
                              setDeleteTarget(receipt)
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

      <Modal
        open={dialog !== null}
        onClose={() => {
          if (!saving) {
            setDialog(null)
            setFormError(null)
          }
        }}
        size="xl"
        title={dialog?.mode === 'edit' ? 'Edit payment receipt' : 'Log payment receipt'}
        description="Record the client payment first; you can reconcile it against tax invoices right after."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="receipt-number" className={labelClass}>
                Receipt number <span className="text-red-500">*</span>
              </label>
              <input
                id="receipt-number"
                value={form.receipt_number}
                onChange={(event) => updateForm('receipt_number', event.target.value)}
                readOnly={form.auto_number}
                maxLength={60}
                placeholder="RCPT-20260101-001"
                className={`${inputClass} ${form.auto_number ? 'bg-slate-50 text-slate-600' : ''}`}
              />
              <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={form.auto_number}
                  onChange={(event) => handleAutoToggle(event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                Auto-generate
              </label>
            </div>

            <div>
              <label htmlFor="receipt-date" className={labelClass}>
                Receipt date <span className="text-red-500">*</span>
              </label>
              <input
                id="receipt-date"
                type="date"
                value={form.receipt_date}
                onChange={(event) => handleDateChange(event.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="receipt-client" className={labelClass}>
              Client <span className="text-red-500">*</span>
            </label>
            <select
              id="receipt-client"
              value={form.client_id}
              onChange={(event) => updateForm('client_id', event.target.value)}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="receipt-amount" className={labelClass}>
                Amount received (₹) <span className="text-red-500">*</span>
              </label>
              <input
                id="receipt-amount"
                type="number"
                min={0.01}
                step="0.01"
                value={form.amount_received}
                onChange={(event) => updateForm('amount_received', event.target.value)}
                required
                placeholder="0.00"
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label htmlFor="receipt-mode" className={labelClass}>
                Payment mode <span className="text-red-500">*</span>
              </label>
              <select
                id="receipt-mode"
                value={form.payment_mode}
                onChange={(event) => updateForm('payment_mode', event.target.value)}
                className={inputClass}
              >
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="receipt-reference" className={labelClass}>
              Reference / transaction ID
            </label>
            <input
              id="receipt-reference"
              value={form.reference_no}
              onChange={(event) => updateForm('reference_no', event.target.value)}
              maxLength={120}
              placeholder="UTR, cheque number or UPI reference"
              className={inputClass}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            {editingReceipt?.client_id && (
              <button
                type="button"
                onClick={() => {
                  if (saving) {
                    return
                  }
                  setDialog(null)
                  setFormError(null)
                  setAllocateTarget(editingReceipt)
                }}
                disabled={saving}
                className={`${secondaryButtonClass} mr-auto`}
              >
                <Coins className="h-4 w-4" />
                Manage allocations
              </button>
            )}
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
              {saving ? 'Saving…' : dialog?.mode === 'edit' ? 'Save changes' : 'Log receipt'}
            </button>
          </div>
        </form>
      </Modal>

      <AllocatePaymentDialog
        open={allocateTarget !== null}
        onClose={() => setAllocateTarget(null)}
        receipt={allocateReceipt}
        onAllocated={async (message) => {
          setAllocateTarget(null)
          setNotice({ tone: 'success', message })
          await loadData({ silent: true })
        }}
        onChanged={async (message) => {
          setNotice({ tone: 'success', message })
          await loadData({ silent: true })
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.receipt_number ?? 'receipt'}?`}
        message="This permanently removes the receipt and any allocations recorded against it. Each affected tax invoice is recalculated back to unpaid or partially paid."
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

function SummaryCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string
  hint: string
  tone?: 'default' | 'amber'
}) {
  return (
    <div className={`${cardClass} px-4 py-4`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
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
          <div className="hidden h-4 w-32 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-slate-100 lg:block" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

function receiptStatus(
  receipt: ReceiptRow,
  applied: number
): { label: string; tone: string } {
  const amount = toNumber(receipt.amount_received)

  if (applied <= EPSILON) {
    return { label: 'Unapplied', tone: 'bg-slate-100 text-slate-600 ring-slate-500/20' }
  }

  if (applied + EPSILON >= amount) {
    return { label: 'Applied', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' }
  }

  return { label: 'Partially applied', tone: 'bg-amber-50 text-amber-700 ring-amber-600/20' }
}

function modeLabel(value: string | null | undefined): string {
  if (!value) {
    return '—'
  }

  return (
    MODE_LABELS.get(value) ??
    value
      .toLowerCase()
      .split(/[\s_]+/)
      .filter(Boolean)
      .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
      .join(' ')
  )
}

function nextReceiptNumber(receipts: ReceiptRow[], date: string): string {
  const day = (date || today()).replace(/-/g, '')
  const prefix = `RCPT-${day}-`

  const used = receipts.filter((receipt) => receipt.receipt_number?.startsWith(prefix)).length
  let sequence = used + 1
  let candidate = `${prefix}${String(sequence).padStart(3, '0')}`

  // Skip any gaps caused by deletions in the current list.
  const existing = new Set(receipts.map((receipt) => receipt.receipt_number))
  while (existing.has(candidate)) {
    sequence += 1
    candidate = `${prefix}${String(sequence).padStart(3, '0')}`
  }

  return candidate
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
