'use client'

import { useMemo } from 'react'

import { InvoiceTimeline } from '@/components/dashboard/invoice-timeline'
import { ModuleLinks } from '@/components/dashboard/module-links'
import { Alert } from '@/components/ui/alert'
import { RefreshIcon, SpinnerIcon } from '@/components/ui/icons'
import {
  SUPABASE_SETUP_MESSAGE,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { calculateKpis, useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot'

export function DashboardAnalytics() {
  const { snapshot, loading, error, lastUpdated, reload } = useDashboardSnapshot()
  const kpis = useMemo(() => (snapshot ? calculateKpis(snapshot) : null), [snapshot])

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
            onClick={reload}
            disabled={loading}
            className={`${secondaryButtonClass} px-2.5 py-1.5`}
          >
            {loading ? <SpinnerIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <Alert tone="error">
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
                receipts: kpis.receiptCount,
              }
            : undefined
        }
      />

      {!snapshot && loading ? (
        <PanelSkeleton />
      ) : !snapshot ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Could not load the dashboard</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">
            {error ?? SUPABASE_SETUP_MESSAGE}
          </p>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className={`${secondaryButtonClass} mt-4`}
          >
            {loading ? <SpinnerIcon className="h-4 w-4" /> : <RefreshIcon className="h-4 w-4" />}
            Try again
          </button>
        </div>
      ) : (
        <InvoiceTimeline
          proforma={snapshot.proforma}
          tax={snapshot.tax}
          receipts={snapshot.receipts}
        />
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
