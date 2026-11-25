'use client'

import { useMemo, type ReactNode } from 'react'
import Link from 'next/link'

import { ArticleTimeline } from '@/components/dashboard/article-timeline'
import { InvoicePipeline } from '@/components/dashboard/invoice-pipeline'
import { InvoiceStatusBreakdown } from '@/components/dashboard/invoice-status-breakdown'
import {
  KpiCard,
  PendingVsBilledArticlesCard,
  TaxInvoicesVsReceiptsCard,
} from '@/components/dashboard/kpi-cards'
import { StatusBreakdown } from '@/components/dashboard/status-breakdown'
import {
  SUPABASE_SETUP_MESSAGE,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import {
  CurrencyIcon,
  ExternalLinkIcon,
  HomeIcon,
  ReceiptIcon,
  RefreshIcon,
  SpinnerIcon,
} from '@/components/ui/icons'
import { formatCurrency } from '@/lib/dashboard'
import { calculateKpis, useDashboardSnapshot } from '@/hooks/use-dashboard-snapshot'

export type DashboardModuleKey = 'articles' | 'proforma' | 'tax' | 'receipts'

const MODULE_META: Record<DashboardModuleKey, { title: string; description: string }> = {
  articles: {
    title: 'Article requests',
    description: 'Throughput, billing split and the status of every request.',
  },
  proforma: {
    title: 'Proforma invoices',
    description: 'Raised value, conversion pipeline and proforma statuses.',
  },
  tax: {
    title: 'Tax invoices',
    description: 'Receivables, collection pipeline and tax invoice statuses.',
  },
  receipts: {
    title: 'Payment receipts',
    description: 'Payments recorded against tax invoices.',
  },
}

export function ModuleDetailsPage({ module }: { module: DashboardModuleKey }) {
  const { snapshot, loading, error, lastUpdated, reload } = useDashboardSnapshot()
  const kpis = useMemo(() => (snapshot ? calculateKpis(snapshot) : null), [snapshot])
  const meta = MODULE_META[module]

  return (
    <div className="space-y-5">
      <Link
        href="/dashboard"
        aria-label="Back to dashboard"
        title="Back to dashboard"
        className="group fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-brand-200 bg-brand-600 text-white shadow-lg transition hover:bg-brand-700 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2"
      >
        <HomeIcon className="h-5 w-5" />
        <span
          role="tooltip"
          className="pointer-events-none absolute right-full mr-2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        >
          Back to dashboard
        </span>
      </Link>

      <div className="space-y-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
              Module details
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {meta.title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{meta.description}</p>
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
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!snapshot && loading ? (
        <>
          <PageSkeleton />
          <PageSkeleton />
        </>
      ) : !snapshot ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Could not load the details</p>
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
        <div className="space-y-4">
          {module === 'articles' && (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                {kpis && (
                  <PendingVsBilledArticlesCard
                    pendingCount={kpis.pending}
                    billedCount={kpis.billed}
                    onProformaCount={kpis.onProforma}
                    taxInvoicedCount={kpis.taxInvoiced}
                  />
                )}
                <StatusBreakdown articles={snapshot.articles} statuses={snapshot.statuses} />
              </div>

              <ArticleTimeline
                articles={snapshot.articles}
                departments={snapshot.departments}
                clients={snapshot.clients}
              />

              <TableLink href="/article-requests" label="Open article requests table" />
            </>
          )}

          {module === 'proforma' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <KpiCard
                  href="/proforma-invoices"
                  label="Total proforma value"
                  value={formatCurrency(kpis?.proformaValue ?? 0)}
                  hint={`${kpis?.proformaCount ?? 0} proforma invoice${
                    (kpis?.proformaCount ?? 0) === 1 ? '' : 's'
                  } raised`}
                  icon={<CurrencyIcon className="h-5 w-5" />}
                  tone="brand"
                />
              </div>

              <InvoicePipeline proforma={snapshot.proforma} tax={snapshot.tax} only="proforma" />

              <InvoiceStatusBreakdown
                title="Proforma status breakdown"
                mode="proforma"
                invoices={snapshot.proforma}
                statuses={snapshot.proformaStatuses}
                emptyLabel="No proforma invoices yet"
              />

              <TableLink href="/proforma-invoices" label="Open proforma invoice table" />
            </>
          )}

          {module === 'tax' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <KpiCard
                  href="/tax-invoices"
                  label="Tax invoice receivables"
                  value={formatCurrency(kpis?.taxValue ?? 0)}
                  hint={`${kpis?.taxCount ?? 0} tax invoice${
                    (kpis?.taxCount ?? 0) === 1 ? '' : 's'
                  } on record`}
                  detail={`${formatCurrency(kpis?.receiptValue ?? 0)} payment receipts till date`}
                  icon={<ReceiptIcon className="h-5 w-5" />}
                  tone="sky"
                />
              </div>

              <InvoicePipeline proforma={snapshot.proforma} tax={snapshot.tax} only="tax" />

              <InvoiceStatusBreakdown
                title="Tax invoice status breakdown"
                mode="tax"
                invoices={snapshot.tax}
                statuses={snapshot.taxStatuses}
                emptyLabel="No tax invoices yet"
              />

              {kpis && (
                <TaxInvoicesVsReceiptsCard
                  taxValue={kpis.taxValue}
                  receiptValue={kpis.receiptValue}
                  outstandingValue={kpis.outstandingValue}
                  receiptCount={kpis.receiptCount}
                />
              )}

              <TableLink href="/tax-invoices" label="Open tax invoice table" />
            </>
          )}

          {module === 'receipts' && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <KpiCard
                  href="/payment-receipts"
                  label="Payment receipts"
                  value={String(kpis?.receiptCount ?? 0)}
                  hint={`${formatCurrency(kpis?.receiptValue ?? 0)} collected till date`}
                  icon={<ReceiptIcon className="h-5 w-5" />}
                  tone="emerald"
                />
              </div>

              {kpis && (
                <TaxInvoicesVsReceiptsCard
                  taxValue={kpis.taxValue}
                  receiptValue={kpis.receiptValue}
                  outstandingValue={kpis.outstandingValue}
                  receiptCount={kpis.receiptCount}
                />
              )}

              <TableLink href="/payment-receipts" label="Open payment receipts table" />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TableLink({ href, label }: { href: string; label: string }): ReactNode {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700 transition hover:border-brand-300 hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {label}
      <ExternalLinkIcon className="h-3.5 w-3.5" />
    </Link>
  )
}

function PageSkeleton({ className }: { className?: string }) {
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
