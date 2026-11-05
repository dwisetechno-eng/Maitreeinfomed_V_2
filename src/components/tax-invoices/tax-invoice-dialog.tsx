'use client'

import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, RefreshCw } from 'lucide-react'

import {
  SUPABASE_SETUP_MESSAGE,
  formatCurrency,
  formatDate,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { Modal } from '@/components/ui/modal'
import { SpinnerIcon } from '@/components/ui/icons'
import { isMissingColumnError } from '@/lib/supabase-errors'
import {
  DEFAULT_TAX_RATE,
  getTaxInvoiceNumberPrefix,
  nextTaxInvoiceNumber,
  proformaGrandTotal,
  proformaTaxAmount,
  roundMoney,
  todayIsoDate,
  toNumber,
  type ProformaForTaxInvoice,
  type ProformaLinkSnapshot,
  type TaxClientOption,
  type TaxInvoiceRow,
  type TaxStatusOption,
} from '@/lib/tax-invoices'
import { createClient } from '@/utils/supabase/client'

type Source = 'manual' | 'proforma'

type FormState = {
  tax_invoice_number: string
  tax_invoice_date: string
  client_id: string
  subtotal: string
  tax_rate: string
  status_code: string
}

type Props = {
  open: boolean
  onClose: () => void
  invoice: TaxInvoiceRow | null
  clients: TaxClientOption[]
  statuses: TaxStatusOption[]
  existingNumbers: Array<string | null | undefined>
  onSaved: (message: string) => void | Promise<void>
}

const EMPTY_FORM: FormState = {
  tax_invoice_number: '',
  tax_invoice_date: todayIsoDate(),
  client_id: '',
  subtotal: '',
  tax_rate: String(DEFAULT_TAX_RATE),
  status_code: 'UNPAID',
}

export function TaxInvoiceDialog({
  open,
  onClose,
  invoice,
  clients,
  statuses,
  existingNumbers,
  onSaved,
}: Props) {
  const [source, setSource] = useState<Source>('manual')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [numberTouched, setNumberTouched] = useState(false)

  const [proformas, setProformas] = useState<ProformaForTaxInvoice[]>([])
  const [proformasLoading, setProformasLoading] = useState(false)
  const [proformasError, setProformasError] = useState<string | null>(null)
  const [selectedProformaIds, setSelectedProformaIds] = useState<Set<string>>(new Set())
  const [refreshKey, setRefreshKey] = useState(0)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = invoice !== null

  useEffect(() => {
    if (!open) {
      return
    }

    setError(null)
    setSource('manual')
    setSelectedProformaIds(new Set())
    setProformas([])
    setProformasError(null)

    if (invoice) {
      const subtotal = toNumber(invoice.subtotal)
      const taxTotal = toNumber(invoice.tax_total)
      const derivedRate =
        subtotal > 0 && taxTotal > 0
          ? roundMoney((taxTotal / subtotal) * 100)
          : DEFAULT_TAX_RATE

      setForm({
        tax_invoice_number: invoice.tax_invoice_number ?? '',
        tax_invoice_date: (invoice.invoice_date ?? todayIsoDate()).slice(0, 10),
        client_id: invoice.client_id ?? '',
        subtotal: String(subtotal),
        tax_rate: String(derivedRate),
        status_code: invoice.status_code ?? 'UNPAID',
      })
      setNumberTouched(true)
      return
    }

    const date = todayIsoDate()

    setForm({
      ...EMPTY_FORM,
      tax_invoice_number: nextTaxInvoiceNumber(existingNumbers, date),
      tax_invoice_date: date,
      client_id: clients[0]?.id ?? '',
      status_code:
        statuses.find((status) => status.status_code === 'UNPAID')?.status_code ?? 'UNPAID',
    })
    setNumberTouched(false)
  }, [clients, existingNumbers, invoice, open, statuses])

  // Clear the proforma selection whenever the client or source changes.
  useEffect(() => {
    setSelectedProformaIds(new Set())
    setError(null)
  }, [form.client_id, source])

  useEffect(() => {
    if (!open || source !== 'proforma' || !form.client_id) {
      setProformas([])
      setProformasLoading(false)
      return
    }

    let cancelled = false

    async function loadProformas() {
      setProformasLoading(true)
      setProformasError(null)

      try {
        const supabase = createClient()
        const { data, error: loadError } = await supabase
          .from('proforma_invoices')
          .select('*')
          .eq('client_id', form.client_id)
          .order('pi_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })

        if (cancelled) {
          return
        }

        if (loadError) {
          throw loadError
        }

        const rows = (data ?? []) as ProformaForTaxInvoice[]

        setProformas(
          rows.filter(
            (proforma) =>
              proforma.status_code !== 'CANCELLED' &&
              proforma.status_code !== 'TAX_INVOICE_GENERATED' &&
              !proforma.tax_invoice_id
          )
        )
      } catch (loadError) {
        if (!cancelled) {
          setProformas([])
          setProformasError(
            getErrorMessage(loadError, 'Unable to load proforma invoices for this client.')
          )
        }
      } finally {
        if (!cancelled) {
          setProformasLoading(false)
        }
      }
    }

    void loadProformas()

    return () => {
      cancelled = true
    }
  }, [form.client_id, open, refreshKey, source])

  const manualSubtotal = Number(form.subtotal)
  const safeManualSubtotal = Number.isFinite(manualSubtotal)
    ? Math.max(0, manualSubtotal)
    : 0
  const manualTaxRate = Number(form.tax_rate)
  const safeManualTaxRate = Number.isFinite(manualTaxRate)
    ? Math.max(0, manualTaxRate)
    : 0
  const manualTaxTotal = roundMoney((safeManualSubtotal * safeManualTaxRate) / 100)
  const manualGrandTotal = roundMoney(safeManualSubtotal + manualTaxTotal)

  const selectedProformas = useMemo(
    () => proformas.filter((proforma) => selectedProformaIds.has(proforma.id)),
    [proformas, selectedProformaIds]
  )

  const proformaSubtotal = roundMoney(
    selectedProformas.reduce((total, proforma) => total + toNumber(proforma.subtotal), 0)
  )
  const proformaTaxTotal = roundMoney(
    selectedProformas.reduce((total, proforma) => total + proformaTaxAmount(proforma), 0)
  )
  const proformaGrandTotalValue = roundMoney(
    selectedProformas.reduce((total, proforma) => total + proformaGrandTotal(proforma), 0)
  )

  const useProformaSource = !isEditing && source === 'proforma'
  const subtotal = useProformaSource ? proformaSubtotal : safeManualSubtotal
  const taxTotal = useProformaSource ? proformaTaxTotal : manualTaxTotal
  const grandTotal = useProformaSource ? proformaGrandTotalValue : manualGrandTotal

  const allProformasSelected =
    proformas.length > 0 &&
    proformas.every((proforma) => selectedProformaIds.has(proforma.id))

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError(null)
  }

  function handleDateChange(value: string) {
    setForm((current) => ({
      ...current,
      tax_invoice_date: value,
      tax_invoice_number: numberTouched
        ? current.tax_invoice_number
        : nextTaxInvoiceNumber(existingNumbers, value || todayIsoDate()),
    }))
    setError(null)
  }

  function toggleProforma(id: string) {
    setSelectedProformaIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setError(null)
  }

  function toggleAllProformas() {
    setSelectedProformaIds(
      allProformasSelected ? new Set() : new Set(proformas.map((proforma) => proforma.id))
    )
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const number = form.tax_invoice_number.trim()

    if (!number) {
      setError('Enter the tax invoice number.')
      return
    }

    if (!form.tax_invoice_date) {
      setError('Choose the tax invoice date.')
      return
    }

    if (!form.client_id) {
      setError('Select the client for this tax invoice.')
      return
    }

    if (useProformaSource && selectedProformas.length === 0) {
      setError('Select at least one proforma invoice to convert.')
      return
    }

    if (!Number.isFinite(manualSubtotal) || manualSubtotal < 0) {
      setError('Subtotal must be zero or a positive number.')
      return
    }

    if (!useProformaSource && subtotal <= 0) {
      setError('Subtotal must be greater than zero.')
      return
    }

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const payload = {
      tax_invoice_number: number,
      client_id: form.client_id,
      invoice_date: form.tax_invoice_date,
      subtotal: roundMoney(subtotal),
      tax_total: roundMoney(taxTotal),
      grand_total: roundMoney(grandTotal),
      status_code: form.status_code || (isEditing ? null : 'UNPAID'),
    }

    if (isEditing && invoice) {
      try {
        const { error: updateError } = await supabase
          .from('tax_invoices')
          .update(payload)
          .eq('id', invoice.id)

        if (updateError) {
          throw updateError
        }

        await onSaved(`Tax invoice ${number} was updated.`)
        onClose()
      } catch (submitError) {
        setError(getErrorMessage(submitError, 'Unable to update the tax invoice.'))
      } finally {
        setSaving(false)
      }

      return
    }

    let createdId: string | null = null
    const previousLinks: ProformaLinkSnapshot[] = selectedProformas.map((proforma) => ({
      id: proforma.id,
      status_code: proforma.status_code,
      tax_invoice_id: proforma.tax_invoice_id ?? null,
    }))

    try {
      const { data: created, error: insertError } = await supabase
        .from('tax_invoices')
        .insert({
          ...payload,
          amount_paid: 0,
        })
        .select('id')
        .single()

      if (insertError) {
        throw insertError
      }

      createdId = (created as { id: string } | null)?.id ?? null

      if (!createdId) {
        throw new Error('The tax invoice could not be created.')
      }

      if (useProformaSource && selectedProformas.length > 0) {
        const proformaIds = selectedProformas.map((proforma) => proforma.id)

        let linkError: unknown = null
        const { error: proformaUpdateError } = await supabase
          .from('proforma_invoices')
          .update({
            tax_invoice_id: createdId,
            status_code: 'TAX_INVOICE_GENERATED',
          })
          .in('id', proformaIds)

        if (proformaUpdateError) {
          if (!isMissingColumnError(proformaUpdateError)) {
            throw proformaUpdateError
          }

          // The link column has not been migrated yet. Keep the status change
          // and store the selected ids on the invoice as a fallback.
          const { error: statusError } = await supabase
            .from('proforma_invoices')
            .update({ status_code: 'TAX_INVOICE_GENERATED' })
            .in('id', proformaIds)

          if (statusError) {
            throw statusError
          }

          linkError = await supabase
            .from('tax_invoices')
            .update({
              document_content: JSON.stringify({
                source: 'PROFORMA',
                proforma_invoice_ids: proformaIds,
              }),
            })
            .eq('id', createdId)
            .then((result) => result.error)
        }

        if (linkError) {
          throw linkError
        }

        const { error: articleError } = await supabase
          .from('article_requests')
          .update({ tax_invoice_id: createdId })
          .in('proforma_invoice_id', proformaIds)

        if (articleError && !isMissingColumnError(articleError)) {
          throw articleError
        }
      }

      await onSaved(
        `Tax invoice ${number} was created${
          useProformaSource && selectedProformas.length > 0
            ? ` from ${selectedProformas.length} proforma invoice${
                selectedProformas.length === 1 ? '' : 's'
              }`
            : ''
        }.`
      )
      onClose()
    } catch (submitError) {
      // Roll back the invoice and any proforma status changes on failure.
      if (createdId) {
        for (const previous of previousLinks) {
          const rollbackBody: Record<string, unknown> = {
            status_code: previous.status_code,
            tax_invoice_id: previous.tax_invoice_id,
          }

          const { error: rollbackError } = await supabase
            .from('proforma_invoices')
            .update(rollbackBody)
            .eq('id', previous.id)

          if (rollbackError && isMissingColumnError(rollbackError)) {
            await supabase
              .from('proforma_invoices')
              .update({ status_code: previous.status_code })
              .eq('id', previous.id)
          }
        }

        try {
          await supabase.from('tax_invoices').delete().eq('id', createdId)
        } catch {
          // Best effort only.
        }
      }

      setError(getErrorMessage(submitError, 'Unable to create the tax invoice.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) {
          onClose()
        }
      }}
      size="3xl"
      title={isEditing ? `Edit tax invoice ${invoice?.tax_invoice_number ?? ''}` : 'New tax invoice'}
      description={
        isEditing
          ? 'Update the invoice number, date, client and amount. Payment allocation totals are preserved.'
          : 'Create a tax invoice manually or convert one or more open proforma invoices.'
      }
      footer={
        <div className="space-y-3">
          {error && (
            <Alert tone="error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-medium tabular-nums text-slate-900">
                {formatCurrency(subtotal)}
              </dd>
              <dt className="text-slate-500">GST</dt>
              <dd className="font-medium tabular-nums text-slate-900">
                {formatCurrency(taxTotal)}
              </dd>
              <dt className="font-semibold text-slate-900">Grand total</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatCurrency(grandTotal)}
              </dd>
            </dl>

            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="tax-invoice-form"
                disabled={saving}
                className={primaryButtonClass}
              >
                {saving ? (
                  <SpinnerIcon className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {saving
                  ? 'Saving…'
                  : isEditing
                    ? 'Save changes'
                    : 'Create tax invoice'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <form id="tax-invoice-form" onSubmit={handleSubmit} className="space-y-4">
        {!isEditing && (
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Invoice source">
            <button
              type="button"
              role="tab"
              aria-selected={source === 'manual'}
              onClick={() => setSource('manual')}
              className={tabClass(source === 'manual')}
            >
              Manual entry
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === 'proforma'}
              onClick={() => setSource('proforma')}
              className={tabClass(source === 'proforma')}
            >
              From proforma invoices
            </button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="tax-number" className={`${labelClass} mb-0`}>
                Tax invoice number <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setForm((current) => ({
                    ...current,
                    tax_invoice_number: nextTaxInvoiceNumber(
                      existingNumbers,
                      current.tax_invoice_date || todayIsoDate()
                    ),
                  }))
                  setNumberTouched(false)
                  setError(null)
                }}
                disabled={saving || isEditing}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50"
              >
                <RefreshCw className="h-3 w-3" />
                Suggest
              </button>
            </div>
            <input
              id="tax-number"
              value={form.tax_invoice_number}
              onChange={(event) => {
                updateForm('tax_invoice_number', event.target.value)
                setNumberTouched(true)
              }}
              maxLength={60}
              required
              placeholder={`${getTaxInvoiceNumberPrefix(form.tax_invoice_date)}0001`}
              className={`${inputClass} font-mono`}
            />
          </div>

          <div>
            <label htmlFor="tax-date" className={labelClass}>
              Tax invoice date <span className="text-red-500">*</span>
            </label>
            <input
              id="tax-date"
              type="date"
              value={form.tax_invoice_date}
              onChange={(event) => handleDateChange(event.target.value)}
              required
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="tax-client" className={labelClass}>
            Client <span className="text-red-500">*</span>
          </label>
          <select
            id="tax-client"
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

        {useProformaSource ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-slate-600">
                Open proforma invoices that have not already been converted are available below.
              </p>
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                disabled={proformasLoading || saving || !form.client_id}
                className={`${secondaryButtonClass} shrink-0 px-2.5 py-1.5`}
                aria-label="Refresh proforma invoices"
              >
                {proformasLoading ? (
                  <SpinnerIcon className="h-4 w-4" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </button>
            </div>

            {proformasError && (
              <Alert tone="error" onDismiss={() => setProformasError(null)}>
                {proformasError}
              </Alert>
            )}

            {proformasLoading ? (
              <div className="space-y-2" aria-hidden="true">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : proformas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center">
                <FileSpreadsheet className="mx-auto h-9 w-9 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-900">
                  No convertible proforma invoices
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Every open proforma invoice for this client is already on a tax invoice, cancelled,
                  or none exist yet.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <caption className="sr-only">Open proforma invoices</caption>
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="w-10 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={allProformasSelected}
                            onChange={toggleAllProformas}
                            aria-label="Select all proforma invoices"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          PI number
                        </th>
                        <th scope="col" className="px-3 py-2.5">
                          Date
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-right">
                          Subtotal
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-right">
                          GST
                        </th>
                        <th scope="col" className="px-3 py-2.5 text-right">
                          Grand total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {proformas.map((proforma) => {
                        const checked = selectedProformaIds.has(proforma.id)

                        return (
                          <tr
                            key={proforma.id}
                            className={checked ? 'bg-brand-50/60' : 'transition-colors hover:bg-slate-50/70'}
                          >
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleProforma(proforma.id)}
                                aria-label={`Select ${proforma.pi_number ?? 'proforma invoice'}`}
                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium text-slate-700">
                              {proforma.pi_number?.trim() ||
                                proforma.id.slice(0, 8).toUpperCase()}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                              {formatDate(proforma.pi_date ?? proforma.invoice_date)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">
                              {formatCurrency(proforma.subtotal)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">
                              {formatCurrency(proformaTaxAmount(proforma))}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                              {formatCurrency(proformaGrandTotal(proforma))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tax-subtotal" className={labelClass}>
                Subtotal (₹) <span className="text-red-500">*</span>
              </label>
              <input
                id="tax-subtotal"
                type="number"
                min={0}
                step="0.01"
                value={form.subtotal}
                onChange={(event) => updateForm('subtotal', event.target.value)}
                required
                placeholder="0.00"
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label htmlFor="tax-rate" className={labelClass}>
                GST rate (%)
              </label>
              <input
                id="tax-rate"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.tax_rate}
                onChange={(event) => updateForm('tax_rate', event.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>
        )}

        {isEditing && (
          <div>
            <label htmlFor="tax-status" className={labelClass}>
              Status
            </label>
            <select
              id="tax-status"
              value={form.status_code}
              onChange={(event) => updateForm('status_code', event.target.value)}
              className={inputClass}
            >
              {statuses.map((status) => (
                <option key={status.status_code} value={status.status_code}>
                  {status.status_label}
                </option>
              ))}
              <option value="OVERDUE">Overdue</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Payment allocations normally update this automatically. Use it to flag an overdue
              invoice.
            </p>
          </div>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <dt className="text-slate-500">Taxable amount</dt>
          <dd className="text-right font-medium tabular-nums text-slate-900">
            {formatCurrency(subtotal)}
          </dd>
          <dt className="text-slate-500">GST amount</dt>
          <dd className="text-right font-medium tabular-nums text-slate-900">
            {formatCurrency(taxTotal)}
          </dd>
          <dt className="border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
            Grand total
          </dt>
          <dd className="border-t border-slate-200 pt-1.5 text-right text-base font-semibold tabular-nums text-slate-900">
            {formatCurrency(grandTotal)}
          </dd>
        </dl>
      </form>
    </Modal>
  )
}

function tabClass(active: boolean) {
  return [
    'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    active
      ? 'bg-white text-slate-900 shadow-sm'
      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
  ].join(' ')
}
