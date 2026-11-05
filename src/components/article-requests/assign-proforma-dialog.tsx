'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FilePlus2, FileSpreadsheet, Link2, RefreshCw } from 'lucide-react'

import {
  SUPABASE_SETUP_MESSAGE,
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
import { Modal } from '@/components/ui/modal'
import { SpinnerIcon } from '@/components/ui/icons'
import { isMissingColumnError } from '@/lib/supabase-errors'
import { createClient } from '@/utils/supabase/client'

export type AssignableArticle = {
  id: string
  description: string
  amount: number
}

type ExistingProforma = {
  id: string
  invoice_date: string | null
  subtotal: number | null
  grand_total: number | null
  tax_amount?: number | null
  status_code: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  clientId: string
  clientName: string
  articles: AssignableArticle[]
  onAssigned: (message: string) => void | Promise<void>
}

const DEFAULT_TAX_RATE = 18

export function AssignProformaDialog({
  open,
  onClose,
  clientId,
  clientName,
  articles,
  onAssigned,
}: Props) {
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [taxRate, setTaxRate] = useState(String(DEFAULT_TAX_RATE))

  const [proformas, setProformas] = useState<ExistingProforma[]>([])
  const [proformasLoading, setProformasLoading] = useState(false)
  const [proformasError, setProformasError] = useState<string | null>(null)
  const [selectedProformaId, setSelectedProformaId] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [proformaStatusCode, setProformaStatusCode] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setMode('new')
    setTaxRate(String(DEFAULT_TAX_RATE))
    setSelectedProformaId('')
    setError(null)
    setProformasError(null)
  }, [open])

  // Default proforma status for newly generated invoices.
  useEffect(() => {
    if (!open || !hasSupabaseEnv()) {
      return
    }

    let cancelled = false

    async function loadStatus() {
      try {
        const supabase = createClient()
        const { data } = await supabase
          .from('proforma_status_master')
          .select('status_code')
          .order('display_order', { ascending: true })
          .order('status_code', { ascending: true })
          .limit(1)
          .maybeSingle()

        if (!cancelled) {
          setProformaStatusCode(data?.status_code ?? null)
        }
      } catch {
        if (!cancelled) {
          setProformaStatusCode(null)
        }
      }
    }

    void loadStatus()

    return () => {
      cancelled = true
    }
  }, [open])

  // Existing open proforma invoices for this client.
  useEffect(() => {
    if (!open || mode !== 'existing' || !clientId) {
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
          .eq('client_id', clientId)
          .order('invoice_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (cancelled) {
          return
        }

        if (loadError) {
          throw loadError
        }

        setProformas((data ?? []) as ExistingProforma[])
      } catch (loadError) {
        if (!cancelled) {
          setProformas([])
          setProformasError(getErrorMessage(loadError, 'Unable to load proforma invoices.'))
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
  }, [open, mode, clientId, refreshKey])

  const selectedProforma =
    proformas.find((proforma) => proforma.id === selectedProformaId) ?? null

  const subtotal = useMemo(
    () => roundMoney(articles.reduce((total, article) => total + article.amount, 0)),
    [articles]
  )

  const numericTaxRate = Number(taxRate)
  const safeTaxRate =
    Number.isFinite(numericTaxRate) && numericTaxRate >= 0 ? numericTaxRate : 0
  const taxAmount = roundMoney((subtotal * safeTaxRate) / 100)
  const grandTotal = roundMoney(subtotal + taxAmount)

  const closeDialog = useCallback(() => {
    if (!saving) {
      onClose()
    }
  }, [onClose, saving])

  async function handleSubmit() {
    if (!clientId) {
      setError('Select article requests for a single client first.')
      return
    }

    if (articles.length === 0) {
      setError('Select at least one article request.')
      return
    }

    if (mode === 'existing' && !selectedProformaId) {
      setError('Choose the proforma invoice to add these requests to.')
      return
    }

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setError(null)

    const supabase = createClient()
    const requestIds = articles.map((article) => article.id)
    const today = new Date().toISOString().slice(0, 10)

    let invoiceId: string | null = null
    let rollback: (() => Promise<void>) | null = null

    try {
      if (mode === 'existing' && selectedProforma) {
        const nextSubtotal = roundMoney((selectedProforma.subtotal ?? 0) + subtotal)
        const nextGrandTotal = roundMoney((selectedProforma.grand_total ?? 0) + grandTotal)
        const previousTaxAmount = selectedProforma.tax_amount ?? 0
        const nextTaxAmount = roundMoney(previousTaxAmount + taxAmount)

        const detailUpdate = await supabase
          .from('proforma_invoices')
          .update({
            subtotal: nextSubtotal,
            grand_total: nextGrandTotal,
            tax_amount: nextTaxAmount,
          })
          .eq('id', selectedProforma.id)

        if (detailUpdate.error && isMissingColumnError(detailUpdate.error)) {
          const fallbackUpdate = await supabase
            .from('proforma_invoices')
            .update({ subtotal: nextSubtotal, grand_total: nextGrandTotal })
            .eq('id', selectedProforma.id)

          if (fallbackUpdate.error) {
            throw fallbackUpdate.error
          }
        } else if (detailUpdate.error) {
          throw detailUpdate.error
        }

        invoiceId = selectedProforma.id
        rollback = async () => {
          await supabase
            .from('proforma_invoices')
            .update({
              subtotal: selectedProforma.subtotal ?? 0,
              grand_total: selectedProforma.grand_total ?? 0,
              tax_amount: previousTaxAmount,
            })
            .eq('id', selectedProforma.id)
        }
      } else {
        const basePayload: Record<string, unknown> = {
          client_id: clientId,
          subtotal,
          grand_total: grandTotal,
          invoice_date: today,
        }

        if (proformaStatusCode) {
          basePayload.status_code = proformaStatusCode
        }

        let insertResult = await supabase
          .from('proforma_invoices')
          .insert({ ...basePayload, tax_rate: safeTaxRate, tax_amount: taxAmount })
          .select('id')
          .single()

        if (insertResult.error && isMissingColumnError(insertResult.error)) {
          insertResult = await supabase
            .from('proforma_invoices')
            .insert(basePayload)
            .select('id')
            .single()
        }

        if (insertResult.error) {
          throw insertResult.error
        }

        invoiceId = insertResult.data?.id ?? null

        if (!invoiceId) {
          throw new Error('The proforma invoice could not be created.')
        }

        const createdId = invoiceId
        rollback = async () => {
          await supabase.from('proforma_invoices').delete().eq('id', createdId)
        }
      }

      const { data: linked, error: linkError } = await supabase
        .from('article_requests')
        .update({ proforma_invoice_id: invoiceId })
        .in('id', requestIds)
        .select('id')

      if (linkError) {
        throw linkError
      }

      if ((linked ?? []).length !== requestIds.length) {
        throw new Error(
          'Some article requests could not be linked to the invoice. Check the table permissions and retry.'
        )
      }

      await onAssigned(
        `${requestIds.length} article request${requestIds.length === 1 ? '' : 's'} added to ${
          mode === 'existing' ? 'the selected proforma invoice' : 'a new proforma invoice'
        }.`
      )
      onClose()
    } catch (submitError) {
      if (rollback) {
        try {
          await rollback()
        } catch {
          // Best effort only.
        }
      }

      setError(getErrorMessage(submitError, 'Unable to add the requests to a proforma invoice.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      size="2xl"
      title="Add to proforma invoice"
      description={`Link ${articles.length} selected request${
        articles.length === 1 ? '' : 's'
      } for ${clientName}.`}
      footer={
        <div className="space-y-3">
          {error && (
            <Alert tone="error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="font-medium tabular-nums text-slate-900">{formatCurrency(subtotal)}</dd>
              <dt className="text-slate-500">GST {safeTaxRate}%</dt>
              <dd className="font-medium tabular-nums text-slate-900">{formatCurrency(taxAmount)}</dd>
              <dt className="font-semibold text-slate-900">Grand total</dt>
              <dd className="font-semibold tabular-nums text-slate-900">
                {formatCurrency(grandTotal)}
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
                onClick={() => void handleSubmit()}
                disabled={saving || articles.length === 0}
                className={primaryButtonClass}
              >
                {saving ? (
                  <SpinnerIcon className="h-4 w-4" />
                ) : mode === 'existing' ? (
                  <Link2 className="h-4 w-4" />
                ) : (
                  <FilePlus2 className="h-4 w-4" />
                )}
                {saving
                  ? 'Linking…'
                  : mode === 'existing'
                    ? 'Add to invoice'
                    : 'Create invoice'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Invoice target">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'new'}
            onClick={() => {
              setMode('new')
              setError(null)
            }}
            className={tabClass(mode === 'new')}
          >
            New proforma invoice
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'existing'}
            onClick={() => {
              setMode('existing')
              setError(null)
            }}
            className={tabClass(mode === 'existing')}
          >
            Existing invoice
          </button>
        </div>

        {mode === 'new' ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
              A new proforma invoice will be created for{' '}
              <span className="font-medium text-slate-900">{clientName}</span> with the selected
              article requests.
            </div>

            <div>
              <label htmlFor="assign-tax-rate" className={labelClass}>
                GST rate (%)
              </label>
              <input
                id="assign-tax-rate"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={taxRate}
                onChange={(event) => setTaxRate(event.target.value)}
                disabled={saving}
                className={`${inputClass} sm:max-w-40 tabular-nums`}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="assign-proforma" className={labelClass}>
                Proforma invoice <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="assign-proforma"
                  value={selectedProformaId}
                  onChange={(event) => {
                    setSelectedProformaId(event.target.value)
                    setError(null)
                  }}
                  disabled={proformasLoading || saving || proformas.length === 0}
                  className={inputClass}
                >
                  <option value="">
                    {proformasLoading
                      ? 'Loading invoices…'
                      : proformas.length === 0
                        ? 'No existing proforma invoices for this client'
                        : 'Select an invoice'}
                  </option>
                  {proformas.map((proforma) => (
                    <option key={proforma.id} value={proforma.id}>
                      {proformaLabel(proforma)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setRefreshKey((value) => value + 1)}
                  disabled={proformasLoading || saving}
                  className={`${secondaryButtonClass} shrink-0 px-2.5 py-2`}
                  aria-label="Refresh proforma invoices"
                >
                  {proformasLoading ? (
                    <SpinnerIcon className="h-4 w-4" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {proformasError && (
              <Alert tone="error" onDismiss={() => setProformasError(null)}>
                {proformasError}
              </Alert>
            )}

            {selectedProforma && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                Current total{' '}
                <span className="font-medium text-slate-900">
                  {formatCurrency(selectedProforma.grand_total ?? 0)}
                </span>
                . This batch adds{' '}
                <span className="font-medium text-slate-900">
                  {formatCurrency(grandTotal)}
                </span>
                .
              </div>
            )}

            <div>
              <label htmlFor="assign-existing-tax-rate" className={labelClass}>
                GST rate (%) for this batch
              </label>
              <input
                id="assign-existing-tax-rate"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={taxRate}
                onChange={(event) => setTaxRate(event.target.value)}
                disabled={saving}
                className={`${inputClass} sm:max-w-40 tabular-nums`}
              />
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Selected requests
          </div>
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {articles.length === 0 ? (
              <li className="px-3 py-4 text-sm text-slate-500">No requests selected.</li>
            ) : (
              articles.map((article) => (
                <li
                  key={article.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="min-w-0 truncate text-slate-700" title={article.description}>
                    {article.description}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-slate-900">
                    {formatCurrency(article.amount)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
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

function proformaLabel(proforma: ExistingProforma) {
  const reference = `PF-${proforma.id.slice(0, 8).toUpperCase()}`
  const date = formatDate(proforma.invoice_date)
  const total = formatCurrency(proforma.grand_total ?? 0)

  return `${reference} · ${date} · ${total}`
}
