'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ExternalLinkIcon, InboxIcon } from '@/components/ui/icons'
import {
  formatCurrency,
  invoiceValue,
  toNumber,
  type InvoiceRow,
  type StatusMasterRow,
} from '@/lib/dashboard'
import { effectiveTaxStatus } from '@/lib/tax-invoices'

type InvoiceStatusBreakdownProps = {
  title: string
  mode: 'proforma' | 'tax'
  invoices: InvoiceRow[]
  statuses: StatusMasterRow[]
  emptyLabel: string
}

type StatusRow = {
  key: string
  code: string
  label: string
  description: string | null
  count: number
  value: number
  percent: number
  isLargest: boolean
}

const UNASSIGNED_CODE = '__unassigned__'

export function InvoiceStatusBreakdown({
  title,
  mode,
  invoices,
  statuses,
  emptyLabel,
}: InvoiceStatusBreakdownProps) {
  const breakdown = useMemo(
    () => buildBreakdown(invoices, statuses, mode),
    [invoices, mode, statuses]
  )

  const hrefBase = mode === 'proforma' ? '/proforma-invoices' : '/tax-invoices'

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Status-wise split of {breakdown.total} {mode === 'proforma' ? 'proforma' : 'tax'}{' '}
            invoice{breakdown.total === 1 ? '' : 's'}. Click a status to open it.
          </p>
        </div>
        <Link
          href={hrefBase}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Open
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </Link>
      </div>

      {breakdown.rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
          <InboxIcon className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-900">{emptyLabel}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Status counts appear here once invoices have been raised.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3.5">
          {breakdown.rows.map((row) => (
            <Link
              key={row.key}
              href={row.code ? `${hrefBase}?status=${encodeURIComponent(row.code)}` : hrefBase}
              className="-mx-2 block rounded-lg px-2 py-1 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              title={`Open ${mode === 'proforma' ? 'proforma' : 'tax'} invoices · ${row.label}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-slate-800" title={row.label}>
                    {row.label}
                  </p>
                  {row.code && (
                    <span className="hidden shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">
                      {row.code}
                    </span>
                  )}
                  {row.isLargest && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      Largest
                    </span>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <span className="text-sm font-semibold tabular-nums text-slate-900">
                    {row.count}
                  </span>
                  <span className="ml-1 text-xs tabular-nums text-slate-500">
                    {formatCurrency(row.value)}
                  </span>
                </div>
              </div>

              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-valuenow={Math.round(row.percent)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${row.label}: ${row.count} of ${breakdown.total} invoices`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${row.percent}%`,
                    backgroundColor: row.isLargest ? '#e11d48' : '#0284c7',
                  }}
                />
              </div>

              {row.description && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.description}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function buildBreakdown(
  invoices: InvoiceRow[],
  statuses: StatusMasterRow[],
  mode: 'proforma' | 'tax'
) {
  const counts = new Map<string, number>()
  const values = new Map<string, number>()

  for (const invoice of invoices) {
    const code =
      mode === 'tax'
        ? effectiveTaxStatus({
            status_code: invoice.status_code ?? null,
            amount_paid: invoice.amount_paid ?? null,
            grand_total: invoice.grand_total ?? null,
          })
        : (invoice.status_code ?? '').trim().toUpperCase()

    const key = code || UNASSIGNED_CODE
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (mode === 'tax') {
      values.set(key, (values.get(key) ?? 0) + toNumber(invoice.amount_paid))
    } else {
      values.set(key, (values.get(key) ?? 0) + invoiceValue(invoice))
    }
  }

  const known = new Set(statuses.map((status) => status.status_code))
  const total = invoices.length

  const base = statuses.map((status) => ({
    key: status.status_code,
    code: status.status_code,
    label: status.status_label,
    description: status.description,
    order: status.display_order ?? 0,
    count: counts.get(status.status_code) ?? 0,
    value: values.get(status.status_code) ?? 0,
  }))

  for (const [code, count] of counts.entries()) {
    if (code === UNASSIGNED_CODE || known.has(code)) {
      continue
    }

    base.push({
      key: code,
      code,
      label: code,
      description: null,
      order: Number.MAX_SAFE_INTEGER,
      count,
      value: values.get(code) ?? 0,
    })
  }

  if (counts.has(UNASSIGNED_CODE)) {
    base.push({
      key: UNASSIGNED_CODE,
      code: '',
      label: 'Unassigned',
      description: 'Invoices without a status.',
      order: Number.MAX_SAFE_INTEGER,
      count: counts.get(UNASSIGNED_CODE) ?? 0,
      value: values.get(UNASSIGNED_CODE) ?? 0,
    })
  }

  base.sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order
    }

    return left.label.localeCompare(right.label)
  })

  const active = base.filter((row) => row.count > 0)
  const maxCount = active.reduce((max, row) => Math.max(max, row.count), 0)

  const rows = active.map<StatusRow>((row) => ({
    key: row.key,
    code: row.code,
    label: row.label,
    description: row.description,
    count: row.count,
    value: row.value,
    percent: total > 0 ? (row.count / total) * 100 : 0,
    isLargest: row.count === maxCount && maxCount > 0,
  }))

  return { total, rows }
}
