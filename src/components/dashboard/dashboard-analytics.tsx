'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { ArticleTimeline } from '@/components/dashboard/article-timeline'
import { InvoicePipeline } from '@/components/dashboard/invoice-pipeline'
import { KpiCards, KpiCardsSkeleton } from '@/components/dashboard/kpi-cards'
import { ModuleLinks } from '@/components/dashboard/module-links'
import { StatusBreakdown } from '@/components/dashboard/status-breakdown'
import {
  SUPABASE_SETUP_MESSAGE,
  getErrorMessage,
  hasSupabaseEnv,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { RefreshIcon, SpinnerIcon } from '@/components/ui/icons'
import {
  invoiceValue,
  type DashboardArticle,
  type InvoiceRow,
  type NamedOption,
  type StatusMasterRow,
} from '@/lib/dashboard'
import { createClient } from '@/utils/supabase/client'

type DashboardSnapshot = {
  proforma: InvoiceRow[]
  tax: InvoiceRow[]
  articles: DashboardArticle[]
  statuses: StatusMasterRow[]
  departments: NamedOption[]
  clients: NamedOption[]
}

export function DashboardAnalytics() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true

    if (!silent) {
      setLoading(true)
    }

    setError(null)

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      if (!silent) {
        setLoading(false)
      }
      return
    }

    try {
      const supabase = createClient()

      const [proformaResult, taxResult, articlesResult, statusesResult, departmentsResult, clientsResult] =
        await Promise.all([
          supabase.from('proforma_invoices').select('*'),
          supabase.from('tax_invoices').select('*'),
          supabase
            .from('article_requests')
            .select(
              'id, client_id, department_id, status_code, request_date, created_at, proforma_invoice_id, tax_invoice_id'
            ),
          supabase
            .from('article_status_master')
            .select('status_code, status_label, display_order, description')
            .order('display_order', { ascending: true })
            .order('status_code', { ascending: true }),
          supabase.from('departments').select('id, department_name').order('department_name'),
          supabase.from('clients').select('id, company_name').order('company_name'),
        ])

      const firstError =
        proformaResult.error ??
        taxResult.error ??
        articlesResult.error ??
        statusesResult.error ??
        departmentsResult.error ??
        clientsResult.error

      if (firstError) {
        throw firstError
      }

      setSnapshot({
        proforma: (proformaResult.data ?? []) as InvoiceRow[],
        tax: (taxResult.data ?? []) as InvoiceRow[],
        articles: (articlesResult.data ?? []) as DashboardArticle[],
        statuses: (statusesResult.data ?? []) as StatusMasterRow[],
        departments: ((departmentsResult.data ?? []) as { id: string; department_name: string }[]).map(
          (department) => ({ id: department.id, name: department.department_name })
        ),
        clients: ((clientsResult.data ?? []) as { id: string; company_name: string }[]).map(
          (client) => ({ id: client.id, name: client.company_name })
        ),
      })
      setLastUpdated(new Date())
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load dashboard analytics.'))
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Re-fetch quietly when the window regains focus or the tab becomes visible
  // again, so reversals made on another route show up without a manual refresh.
  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== 'visible') {
        return
      }

      void loadData({ silent: true })
    }

    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)

    return () => {
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [loadData])

  const kpis = useMemo(() => {
    if (!snapshot) {
      return null
    }

    const proformaValue = snapshot.proforma.reduce(
      (total, invoice) => total + invoiceValue(invoice),
      0
    )
    const taxValue = snapshot.tax.reduce((total, invoice) => total + invoiceValue(invoice), 0)

    let pending = 0
    let onProforma = 0
    let taxInvoiced = 0

    for (const article of snapshot.articles) {
      if (article.tax_invoice_id) {
        taxInvoiced += 1
      } else if (article.proforma_invoice_id) {
        onProforma += 1
      } else {
        pending += 1
      }
    }

    return {
      proformaValue,
      proformaCount: snapshot.proforma.length,
      taxValue,
      taxCount: snapshot.tax.length,
      pending,
      onProforma,
      taxInvoiced,
      billed: onProforma + taxInvoiced,
    }
  }, [snapshot])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Analytics
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            A live snapshot of invoice value, article throughput and the statuses where work is
            waiting.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastUpdated && (
            <p className="hidden text-xs text-slate-500 sm:block">
              Updated{' '}
              {lastUpdated.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          )}
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
      </div>

      {error && (
        <Alert tone="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <ModuleLinks
        stats={
          kpis
            ? {
                articles: kpis.pending + kpis.billed,
                proformas: kpis.proformaCount,
                taxInvoices: kpis.taxCount,
              }
            : undefined
        }
      />

      {!snapshot && loading ? (
        <>
          <KpiCardsSkeleton />
          <div className="grid gap-4 xl:grid-cols-2">
            <PanelSkeleton />
            <PanelSkeleton />
          </div>
          <div className="grid gap-4 xl:grid-cols-5">
            <PanelSkeleton className="xl:col-span-3" />
            <PanelSkeleton className="xl:col-span-2" />
          </div>
        </>
      ) : !snapshot ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Could not load the dashboard</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
            {error ?? 'Check the Supabase connection and try again.'}
          </p>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className={`${secondaryButtonClass} mt-4`}
          >
            {loading ? <SpinnerIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
            Try again
          </button>
        </div>
      ) : (
        <>
          {kpis && (
            <KpiCards
              proformaValue={kpis.proformaValue}
              proformaCount={kpis.proformaCount}
              taxValue={kpis.taxValue}
              taxCount={kpis.taxCount}
              pendingCount={kpis.pending}
              billedCount={kpis.billed}
              onProformaCount={kpis.onProforma}
              taxInvoicedCount={kpis.taxInvoiced}
            />
          )}

          <InvoicePipeline proforma={snapshot.proforma} tax={snapshot.tax} />

          <div className="grid gap-4 xl:grid-cols-5">
            <div className="xl:col-span-3">
              <ArticleTimeline
                articles={snapshot.articles}
                departments={snapshot.departments}
                clients={snapshot.clients}
              />
            </div>
            <div className="xl:col-span-2">
              <StatusBreakdown articles={snapshot.articles} statuses={snapshot.statuses} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function PanelSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className ?? ''}`}
      aria-hidden="true"
    >
      <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-3 w-56 animate-pulse rounded bg-slate-100" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-6 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    </div>
  )
}
