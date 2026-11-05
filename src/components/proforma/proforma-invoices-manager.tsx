'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { CreateProformaDialog } from '@/components/dialogs/CreateProformaDialog'
import {
  SUPABASE_SETUP_MESSAGE,
  formatDate,
  getErrorMessage,
  hasSupabaseEnv,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { InboxIcon, PlusIcon, RefreshIcon, SpinnerIcon } from '@/components/ui/icons'
import { createClient } from '@/utils/supabase/client'

type ClientOption = { id: string; company_name: string }

type ProformaInvoiceRow = {
  id: string
  pi_number: string | null
  pi_date: string | null
  client_id: string | null
  status_code: string | null
  subtotal: number | null
  grand_total: number | null
  invoice_date: string | null
  created_at: string | null
}

export function ProformaInvoicesManager() {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [invoices, setInvoices] = useState<ProformaInvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

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
      const [clientsResult, invoicesResult] = await Promise.all([
        supabase.from('clients').select('id, company_name').order('company_name'),
        supabase
          .from('proforma_invoices')
          .select('*')
          .order('invoice_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ])

      if (clientsResult.error) {
        throw clientsResult.error
      }

      if (invoicesResult.error) {
        throw invoicesResult.error
      }

      setClients((clientsResult.data ?? []) as ClientOption[])
      setInvoices((invoicesResult.data ?? []) as ProformaInvoiceRow[])
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

        <button type="button" onClick={() => setDialogOpen(true)} className={primaryButtonClass}>
          <PlusIcon className="h-4 w-4" />
          New proforma invoice
        </button>
      </div>

      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Recent invoices</h2>
            <p className="text-xs text-slate-500">
              {loading ? 'Loading…' : `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className={`${secondaryButtonClass} px-2.5 py-1.5`}
          >
            {loading ? <SpinnerIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {loadError && (
          <div className="border-b border-slate-200 px-4 py-3">
            <Alert tone="error" onDismiss={() => setLoadError(null)}>
              {loadError}
            </Alert>
          </div>
        )}

        {loading ? (
          <div className="divide-y divide-slate-100" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="flex items-center gap-4 px-4 py-4">
                <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <InboxIcon className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">No proforma invoices yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create one to group unbilled article requests for a client.
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className={`${secondaryButtonClass} mt-4`}
            >
              <PlusIcon className="h-4 w-4" />
              New proforma invoice
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Proforma invoices</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Invoice
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Invoice date
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Subtotal
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Grand total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-slate-700">
                        {invoice.pi_number?.trim() || invoice.id.slice(0, 8).toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {invoice.client_id ? clientNames.get(invoice.client_id) ?? 'Unknown client' : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {formatDate(invoice.pi_date ?? invoice.invoice_date ?? invoice.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {invoice.status_code ? (
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium text-slate-700">
                          {invoice.status_code}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatCurrency(invoice.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {formatCurrency(invoice.grand_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateProformaDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={() => {
          setNotice('Proforma invoice created and article requests linked.')
          void loadData({ silent: true })
        }}
      />
    </div>
  )
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(typeof value === 'number' && Number.isFinite(value) ? value : 0)
}
