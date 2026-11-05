'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Coins, RefreshCw, Wand2 } from 'lucide-react'

import {
  SUPABASE_SETUP_MESSAGE,
  formatCurrency,
  formatDate,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  primaryButtonClass,
  roundMoney,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { Modal } from '@/components/ui/modal'
import { SpinnerIcon } from '@/components/ui/icons'
import { isMissingColumnError, isMissingTableError } from '@/lib/supabase-errors'
import { createClient } from '@/utils/supabase/client'

export type ReceiptForAllocation = {
  id: string
  receipt_number: string
  receipt_date: string | null
  client_id: string | null
  client_name: string
  amount_received: number
}

export type TaxInvoiceRow = {
  id: string
  client_id: string | null
  invoice_date: string | null
  subtotal: number | null
  grand_total: number | null
  status_code: string | null
  amount_paid?: number | null
  created_at: string | null
}

export type AllocationRow = {
  id: string
  receipt_id: string
  tax_invoice_id: string
  amount: number | null
  created_at?: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  receipt: ReceiptForAllocation | null
  onAllocated: (message: string) => void | Promise<void>
}

const EPSILON = 0.005

export function AllocatePaymentDialog({ open, onClose, receipt, onAllocated }: Props) {
  const [invoices, setInvoices] = useState<TaxInvoiceRow[]>([])
  const [allocations, setAllocations] = useState<AllocationRow[]>([])
  const [allocationsAvailable, setAllocationsAvailable] = useState(true)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setDraft({})
    setSaveError(null)
    setLoadError(null)
    setInvoices([])
    setAllocations([])
  }, [open, receipt?.id])

  useEffect(() => {
    if (!open || !receipt?.client_id) {
      return
    }

    let cancelled = false

    async function load() {
      if (!hasSupabaseEnv()) {
        setLoadError(SUPABASE_SETUP_MESSAGE)
        return
      }

      setLoading(true)
      setLoadError(null)

      try {
        const supabase = createClient()

        const [invoicesResult, allocationsResult] = await Promise.all([
          supabase
            .from('tax_invoices')
            .select('*')
            .eq('client_id', receipt!.client_id)
            .order('invoice_date', { ascending: true })
            .order('created_at', { ascending: true }),
          supabase.from('payment_allocations').select('*'),
        ])

        if (cancelled) {
          return
        }

        if (invoicesResult.error) {
          throw invoicesResult.error
        }

        let tableAvailable = true

        if (allocationsResult.error) {
          if (isMissingTableError(allocationsResult.error)) {
            tableAvailable = false
          } else {
            throw allocationsResult.error
          }
        }

        setInvoices((invoicesResult.data ?? []) as TaxInvoiceRow[])
        setAllocations(tableAvailable ? ((allocationsResult.data ?? []) as AllocationRow[]) : [])
        setAllocationsAvailable(tableAvailable)
      } catch (error) {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, 'Unable to load outstanding tax invoices.'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [open, receipt, refreshKey])

  const paidByInvoice = useMemo(() => {
    const map = new Map<string, number>()

    if (allocationsAvailable) {
      for (const allocation of allocations) {
        const amount = toNumber(allocation.amount)
        map.set(allocation.tax_invoice_id, (map.get(allocation.tax_invoice_id) ?? 0) + amount)
      }
      return map
    }

    for (const invoice of invoices) {
      map.set(invoice.id, toNumber(invoice.amount_paid))
    }

    return map
  }, [allocations, allocationsAvailable, invoices])

  const appliedToReceipt = useMemo(() => {
    if (!receipt) {
      return 0
    }

    return roundMoney(
      allocations
        .filter((allocation) => allocation.receipt_id === receipt.id)
        .reduce((total, allocation) => total + toNumber(allocation.amount), 0)
    )
  }, [allocations, receipt])

  const receiptTotal = toNumber(receipt?.amount_received)
  const receiptRemaining = roundMoney(Math.max(0, receiptTotal - appliedToReceipt))

  const outstandingInvoices = useMemo(
    () =>
      invoices
        .map((invoice) => {
          const total = toNumber(invoice.grand_total)
          const paid = paidByInvoice.get(invoice.id) ?? 0
          const outstanding = roundMoney(Math.max(0, total - paid))

          return { invoice, total, paid, outstanding }
        })
        .filter((entry) => entry.outstanding > EPSILON),
    [invoices, paidByInvoice]
  )

  const draftTotal = useMemo(
    () =>
      roundMoney(
        Object.values(draft).reduce((total, value) => {
          const amount = Number(value)
          return total + (Number.isFinite(amount) && amount > 0 ? amount : 0)
        }, 0)
      ),
    [draft]
  )

  const closeDialog = useCallback(() => {
    if (!saving) {
      onClose()
    }
  }, [onClose, saving])

  function setDraftAmount(invoiceId: string, value: string) {
    setDraft((current) => ({ ...current, [invoiceId]: value }))
    setSaveError(null)
  }

  function autoApply() {
    let remaining = receiptRemaining
    const next: Record<string, string> = {}

    for (const entry of outstandingInvoices) {
      if (remaining <= EPSILON) {
        break
      }

      const amount = roundMoney(Math.min(remaining, entry.outstanding))

      if (amount > EPSILON) {
        next[entry.invoice.id] = amount.toFixed(2)
        remaining = roundMoney(remaining - amount)
      }
    }

    setDraft(next)
    setSaveError(null)
  }

  async function handleApply() {
    if (!receipt) {
      return
    }

    if (!allocationsAvailable) {
      setSaveError(
        'Payment allocation needs the payment_allocations table. Apply the latest Supabase migration first.'
      )
      return
    }

    const entries = outstandingInvoices
      .map((entry) => ({ ...entry, amount: roundMoney(Number(draft[entry.invoice.id])) }))
      .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)

    if (entries.length === 0) {
      setSaveError('Enter an amount against at least one tax invoice.')
      return
    }

    for (const entry of entries) {
      if (entry.amount - entry.outstanding > EPSILON) {
        setSaveError(
          `The amount applied to ${invoiceLabel(entry.invoice)} is more than the outstanding balance.`
        )
        return
      }
    }

    if (draftTotal - receiptRemaining > EPSILON) {
      setSaveError('The allocated amount is more than the unapplied balance on this receipt.')
      return
    }

    if (!hasSupabaseEnv()) {
      setSaveError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setSaveError(null)

    const supabase = createClient()
    const insertedIds: string[] = []
    const updatedInvoices: Array<{ id: string; status_code: string | null; amount_paid?: number | null }> = []

    try {
      for (const entry of entries) {
        const nextPaid = roundMoney(entry.paid + entry.amount)
        const nextStatus =
          nextPaid + EPSILON >= entry.total ? 'PAID' : nextPaid > EPSILON ? 'PARTIALLY_PAID' : 'UNPAID'

        const { data: inserted, error: insertError } = await supabase
          .from('payment_allocations')
          .insert({
            receipt_id: receipt.id,
            tax_invoice_id: entry.invoice.id,
            amount: entry.amount,
          })
          .select('id')
          .single()

        if (insertError) {
          throw insertError
        }

        if (inserted?.id) {
          insertedIds.push(inserted.id as string)
        }

        let updateResult = await supabase
          .from('tax_invoices')
          .update({ status_code: nextStatus, amount_paid: nextPaid })
          .eq('id', entry.invoice.id)

        if (updateResult.error && isMissingColumnError(updateResult.error)) {
          updateResult = await supabase
            .from('tax_invoices')
            .update({ status_code: nextStatus })
            .eq('id', entry.invoice.id)
        }

        if (updateResult.error) {
          throw updateResult.error
        }

        updatedInvoices.push({
          id: entry.invoice.id,
          status_code: entry.invoice.status_code,
          amount_paid: entry.invoice.amount_paid,
        })
      }

      await onAllocated(
        `${formatCurrency(draftTotal)} applied across ${entries.length} tax invoice${
          entries.length === 1 ? '' : 's'
        }.`
      )
      onClose()
    } catch (error) {
      // Roll back allocations and invoice statuses so we never leave a partial split.
      if (insertedIds.length > 0) {
        try {
          await supabase.from('payment_allocations').delete().in('id', insertedIds)
        } catch {
          // Best effort only.
        }
      }

      for (const previous of updatedInvoices) {
        try {
          await supabase
            .from('tax_invoices')
            .update({
              status_code: previous.status_code,
              ...(typeof previous.amount_paid === 'number'
                ? { amount_paid: previous.amount_paid }
                : {}),
            })
            .eq('id', previous.id)
        } catch {
          // Best effort only.
        }
      }

      setSaveError(getErrorMessage(error, 'Unable to apply the payment to the invoices.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      size="3xl"
      title="Apply payment to tax invoices"
      description={
        receipt
          ? `${receipt.receipt_number} · ${receipt.client_name} · ${formatCurrency(receiptTotal)}`
          : undefined
      }
      footer={
        <div className="space-y-3">
          {saveError && (
            <Alert tone="error" onDismiss={() => setSaveError(null)}>
              {saveError}
            </Alert>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
              <dt className="text-slate-500">Unapplied</dt>
              <dd className="font-medium tabular-nums text-slate-900">
                {formatCurrency(receiptRemaining)}
              </dd>
              <dt className="text-slate-500">Allocating now</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatCurrency(draftTotal)}
              </dd>
            </dl>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleApply()}
                disabled={saving || draftTotal <= 0 || !allocationsAvailable}
                className={primaryButtonClass}
              >
                {saving ? <SpinnerIcon className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
                {saving ? 'Applying…' : 'Apply payment'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {!allocationsAvailable && (
          <Alert tone="error">
            Allocation tracking is not available yet. Apply the latest Supabase migration to create
            the <code className="rounded bg-red-100 px-1">payment_allocations</code> table and add{' '}
            <code className="rounded bg-red-100 px-1">tax_invoices.amount_paid</code>.
          </Alert>
        )}

        {loadError && (
          <Alert tone="error" onDismiss={() => setLoadError(null)}>
            {loadError}
          </Alert>
        )}

        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            Already applied to this receipt:{' '}
            <span className="font-medium text-slate-900">{formatCurrency(appliedToReceipt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={autoApply}
              disabled={loading || saving || receiptRemaining <= 0 || outstandingInvoices.length === 0}
              className={`${secondaryButtonClass} px-2.5 py-1.5`}
            >
              <Wand2 className="h-4 w-4" />
              Auto-apply
            </button>
            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading || saving}
              className={`${secondaryButtonClass} px-2.5 py-1.5`}
              aria-label="Refresh invoices"
            >
              {loading ? <SpinnerIcon className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : outstandingInvoices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
            <Coins className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">No outstanding tax invoices</p>
            <p className="mt-1 text-sm text-slate-500">
              Every tax invoice for this client is fully paid, or none exist yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <caption className="sr-only">Outstanding tax invoices for this client</caption>
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">
                      Invoice
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Total
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Paid
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Outstanding
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Apply
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {outstandingInvoices.map((entry) => (
                    <tr key={entry.invoice.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">
                        {invoiceLabel(entry.invoice)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                        {formatDate(entry.invoice.invoice_date ?? entry.invoice.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(entry.total)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">
                        {formatCurrency(entry.paid)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">
                        {formatCurrency(entry.outstanding)}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={0}
                          max={entry.outstanding}
                          step="0.01"
                          value={draft[entry.invoice.id] ?? ''}
                          onChange={(event) =>
                            setDraftAmount(entry.invoice.id, event.target.value)
                          }
                          disabled={saving || !allocationsAvailable}
                          placeholder="0.00"
                          aria-label={`Amount to apply to ${invoiceLabel(entry.invoice)}`}
                          className={`${inputClass} w-32 py-1.5 text-right tabular-nums`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export function invoiceLabel(invoice: TaxInvoiceRow): string {
  return `INV-${invoice.id.slice(0, 8).toUpperCase()}`
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
