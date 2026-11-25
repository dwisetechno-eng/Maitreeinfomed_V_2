'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ClockIcon, CurrencyIcon, ExternalLinkIcon } from '@/components/ui/icons'
import { formatCurrency } from '@/lib/dashboard'

export type KpiCardProps = {
  href: string
  label: string
  value: string
  hint: string
  detail?: string
  icon: ReactNode
  tone: 'brand' | 'sky' | 'emerald'
}

export function KpiCard({
  href,
  label,
  value,
  hint,
  detail,
  icon,
  tone,
}: KpiCardProps) {
  const toneClasses =
    tone === 'brand'
      ? 'bg-brand-50 text-brand-700'
      : tone === 'sky'
        ? 'bg-sky-50 text-sky-700'
        : 'bg-emerald-50 text-emerald-700'

  const cardTone =
    tone === 'brand'
      ? 'border-brand-100 bg-brand-50/40 hover:border-brand-200 hover:bg-brand-50/70'
      : tone === 'sky'
        ? 'border-sky-100 bg-sky-50/40 hover:border-sky-200 hover:bg-sky-50/70'
        : 'border-emerald-100 bg-emerald-50/40 hover:border-emerald-200 hover:bg-emerald-50/70'

  return (
    <Link
      href={href}
      className={`group block rounded-2xl border p-5 shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${cardTone}`}
      title={`Open ${label.toLowerCase()}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            {label}
            <ExternalLinkIcon className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-brand-600" />
          </p>
          <p
            className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900 tabular-nums"
            title={value}
          >
            {value}
          </p>
        </div>

        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/80 ${toneClasses}`}
        >
          {icon}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-500">{hint}</p>
      {detail && <p className="mt-1 text-xs font-medium text-sky-700">{detail}</p>}
    </Link>
  )
}

export type PendingVsBilledArticlesCardProps = {
  pendingCount: number
  billedCount: number
  onProformaCount: number
  taxInvoicedCount: number
}

export function PendingVsBilledArticlesCard({
  pendingCount,
  billedCount,
  onProformaCount,
  taxInvoicedCount,
}: PendingVsBilledArticlesCardProps) {
  const articleTotal = pendingCount + billedCount
  const pendingPercent = articleTotal > 0 ? (pendingCount / articleTotal) * 100 : 0
  const billedPercent = articleTotal > 0 ? (billedCount / articleTotal) * 100 : 0

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/article-requests"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Pending vs billed articles
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </Link>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <Link
              href="/article-requests?billing=pending"
              className="rounded-lg transition hover:bg-amber-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title="Open pending article requests"
            >
              <p className="text-xs text-slate-500">Pending</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-amber-600 tabular-nums">
                {pendingCount}
              </p>
            </Link>
            <Link
              href="/article-requests?billing=billed"
              className="rounded-lg transition hover:bg-brand-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title="Open billed article requests"
            >
              <p className="text-xs text-slate-500">Billed</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-brand-700 tabular-nums">
                {billedCount}
              </p>
            </Link>
          </div>
        </div>

        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <ClockIcon className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div style={{ width: `${pendingPercent}%` }} className="bg-amber-400" />
        <div style={{ width: `${billedPercent}%` }} className="bg-brand-500" />
      </div>

      <p className="mt-2 text-xs text-slate-500">
        <Link href="/article-requests?status=PI_GENERATED" className="hover:text-brand-700 hover:underline">
          {onProformaCount} awaiting tax invoice
        </Link>{' '}
        ·{' '}
        <Link href="/article-requests?status=COMPLETED" className="hover:text-brand-700 hover:underline">
          {taxInvoicedCount} tax invoiced
        </Link>
      </p>
    </article>
  )
}

export type TaxInvoicesVsReceiptsCardProps = {
  taxValue: number
  receiptValue: number
  outstandingValue: number
  receiptCount: number
}

export function TaxInvoicesVsReceiptsCard({
  taxValue,
  receiptValue,
  outstandingValue,
  receiptCount,
}: TaxInvoicesVsReceiptsCardProps) {
  const collectedPercent = taxValue > 0 ? Math.min((receiptValue / taxValue) * 100, 100) : 0

  return (
    <article className="rounded-2xl border border-amber-100 bg-amber-50/35 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/payment-receipts"
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Tax invoices vs receipts
            <ExternalLinkIcon className="h-3.5 w-3.5" />
          </Link>

          <div className="mt-3 grid grid-cols-2 gap-4">
            <Link
              href="/tax-invoices"
              className="min-w-0 rounded-lg transition hover:bg-emerald-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title="Open tax invoices"
            >
              <p className="text-xs text-slate-500">Invoiced</p>
              <p className="mt-0.5 truncate text-xl font-semibold tracking-tight text-emerald-700 tabular-nums">
                {formatCurrency(taxValue)}
              </p>
            </Link>
            <Link
              href="/payment-receipts"
              className="min-w-0 rounded-lg transition hover:bg-amber-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title="Open payment receipts"
            >
              <p className="text-xs text-slate-500">Collected</p>
              <p className="mt-0.5 truncate text-xl font-semibold tracking-tight text-amber-600 tabular-nums">
                {formatCurrency(receiptValue)}
              </p>
            </Link>
          </div>
        </div>

        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
          <CurrencyIcon className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div style={{ width: `${collectedPercent}%` }} className="bg-emerald-500" />
      </div>

      <p className="mt-2 truncate text-xs text-slate-500">
        {formatCurrency(outstandingValue)} outstanding ·{' '}
        <Link href="/payment-receipts" className="hover:text-brand-700 hover:underline">
          {receiptCount} receipt{receiptCount === 1 ? '' : 's'} recorded
        </Link>
      </p>
    </article>
  )
}

export function KpiCardsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[0, 1].map((row) => (
        <div
          key={row}
          className={`grid gap-4 sm:grid-cols-2 ${row === 0 ? 'xl:grid-cols-3' : ''}`}
        >
          {Array.from({ length: row === 0 ? 3 : 2 }).map((_, index) => (
            <div
              key={`${row}-${index}`}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 space-y-3">
                  <div className="h-3 w-32 animate-pulse rounded bg-slate-100" />
                  <div className="h-7 w-40 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-10 w-10 animate-pulse rounded-xl bg-slate-100" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
