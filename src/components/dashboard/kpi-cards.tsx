'use client'

import type { ReactNode } from 'react'

import { ClockIcon, CurrencyIcon, ReceiptIcon } from '@/components/ui/icons'
import { formatCurrency } from '@/lib/dashboard'

type KpiCardsProps = {
  proformaValue: number
  proformaCount: number
  taxValue: number
  taxCount: number
  pendingCount: number
  billedCount: number
  onProformaCount: number
  taxInvoicedCount: number
}

export function KpiCards({
  proformaValue,
  proformaCount,
  taxValue,
  taxCount,
  pendingCount,
  billedCount,
  onProformaCount,
  taxInvoicedCount,
}: KpiCardsProps) {
  const articleTotal = pendingCount + billedCount
  const pendingPercent = articleTotal > 0 ? (pendingCount / articleTotal) * 100 : 0
  const billedPercent = articleTotal > 0 ? (billedCount / articleTotal) * 100 : 0

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard
        label="Total proforma value"
        value={formatCurrency(proformaValue)}
        hint={`${proformaCount} proforma invoice${proformaCount === 1 ? '' : 's'} raised`}
        icon={<CurrencyIcon className="h-5 w-5" />}
        tone="brand"
      />

      <KpiCard
        label="Tax invoice receivables"
        value={formatCurrency(taxValue)}
        hint={`${taxCount} tax invoice${taxCount === 1 ? '' : 's'} on record`}
        icon={<ReceiptIcon className="h-5 w-5" />}
        tone="sky"
      />

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              Pending vs billed articles
            </p>

            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500">Pending</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight text-amber-600 tabular-nums">
                  {pendingCount}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Billed</p>
                <p className="mt-0.5 text-2xl font-semibold tracking-tight text-brand-700 tabular-nums">
                  {billedCount}
                </p>
              </div>
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
          {onProformaCount} awaiting tax invoice · {taxInvoicedCount} tax invoiced
        </p>
      </article>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: string
  hint: string
  icon: ReactNode
  tone: 'brand' | 'sky'
}) {
  const toneClasses =
    tone === 'brand' ? 'bg-brand-50 text-brand-700' : 'bg-sky-50 text-sky-700'

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p
            className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900 tabular-nums"
            title={value}
          >
            {value}
          </p>
        </div>

        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClasses}`}
        >
          {icon}
        </span>
      </div>

      <p className="mt-2 text-xs text-slate-500">{hint}</p>
    </article>
  )
}

export function KpiCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
  )
}
