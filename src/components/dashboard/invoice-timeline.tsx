'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import { ChartBarIcon } from '@/components/ui/icons'
import { formatCurrency, type DashboardReceipt, type InvoiceRow } from '@/lib/dashboard'
import {
  TIMELINE_SERIES,
  buildInvoiceTimeline,
  formatCompactCurrency,
  type TimelineMetric,
  type TimelineSeriesKey,
} from '@/lib/invoice-timeline'

type InvoiceTimelineProps = {
  proforma: InvoiceRow[]
  tax: InvoiceRow[]
  receipts: DashboardReceipt[]
}

type TimelineViewMode = 'combined' | 'separate'

export function InvoiceTimeline({ proforma, tax, receipts }: InvoiceTimelineProps) {
  const [viewMode, setViewMode] = useState<TimelineViewMode>('separate')
  const [metric, setMetric] = useState<TimelineMetric>('value')

  const timeline = useMemo(
    () => buildInvoiceTimeline({ proforma, tax, receipts, metric }),
    [metric, proforma, receipts, tax]
  )

  const formatValue = (value: number) =>
    metric === 'value' ? formatCurrency(value) : String(value)
  const formatAxis = (value: number) =>
    metric === 'value' ? formatCompactCurrency(value) : String(value)

  function seriesValue(bucket: (typeof timeline.buckets)[number], key: TimelineSeriesKey) {
    return metric === 'value' ? bucket.values[key] : bucket.counts[key]
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Invoice &amp; payment timeline</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Proforma invoices, tax invoices and payment receipts over the last six months.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-lg bg-slate-100 p-1"
            role="group"
            aria-label="Timeline layout"
          >
            <button
              type="button"
              onClick={() => setViewMode('separate')}
              aria-pressed={viewMode === 'separate'}
              className={toggleClass(viewMode === 'separate')}
            >
              Separate
            </button>
            <button
              type="button"
              onClick={() => setViewMode('combined')}
              aria-pressed={viewMode === 'combined'}
              className={toggleClass(viewMode === 'combined')}
            >
              Combined
            </button>
          </div>

          <div
            className="inline-flex rounded-lg bg-slate-100 p-1"
            role="group"
            aria-label="Timeline metric"
          >
            <button
              type="button"
              onClick={() => setMetric('value')}
              aria-pressed={metric === 'value'}
              className={toggleClass(metric === 'value')}
            >
              Value
            </button>
            <button
              type="button"
              onClick={() => setMetric('count')}
              aria-pressed={metric === 'count'}
              className={toggleClass(metric === 'count')}
            >
              Count
            </button>
          </div>
        </div>
      </div>

      {!timeline.hasData ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
          <ChartBarIcon className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-900">No invoices or receipts to chart</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Monthly totals appear here once invoices or payments have been recorded.
          </p>
        </div>
      ) : viewMode === 'combined' ? (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <span>{timeline.rangeLabel}</span>
            <span>
              Peak month:{' '}
              <span className="font-medium text-slate-700">
                {formatValue(timeline.peakTotal)}
              </span>
            </span>
          </div>

          <div className="mt-6">
            <p className="text-[11px] text-slate-400">Max {formatAxis(timeline.maxTotal)}</p>
            <div className="mt-3 flex gap-2 sm:gap-4">
              {timeline.buckets.map((bucket) => {
                const total = TIMELINE_SERIES.reduce(
                  (sum, series) => sum + seriesValue(bucket, series.key),
                  0
                )

                return (
                  <div
                    key={bucket.key}
                    className="min-w-0 flex-1 text-center text-[10px] font-medium tabular-nums text-slate-600"
                    title={formatValue(total)}
                  >
                    {total > 0 ? formatAxis(total) : ''}
                  </div>
                )
              })}
            </div>
            <div className="relative mt-1 h-52">
              {[0, 25, 50, 75, 100].map((percent) => (
                <div
                  key={percent}
                  className="absolute inset-x-0 border-t border-dashed border-slate-200"
                  style={{ bottom: `${percent}%` }}
                  aria-hidden="true"
                />
              ))}

              <div className="absolute inset-0 flex items-end gap-2 sm:gap-4">
                {timeline.buckets.map((bucket) => (
                  <div
                    key={bucket.key}
                    className="flex h-full flex-1 items-end justify-center gap-0.5 sm:gap-1"
                  >
                    {TIMELINE_SERIES.map((series) => {
                      const value = seriesValue(bucket, series.key)
                      const height = value > 0 ? Math.max((value / timeline.maxTotal) * 100, 2) : 0

                      return (
                        <div
                          key={series.key}
                          className="w-2 rounded-t-sm transition-opacity hover:opacity-75 sm:w-3"
                          style={{ height: `${height}%`, backgroundColor: series.color }}
                          title={`${bucket.fullLabel} · ${series.label}: ${formatValue(value)}`}
                          aria-label={`${bucket.fullLabel} ${series.label}: ${formatValue(value)}`}
                          role="img"
                        />
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-2 flex gap-2 sm:gap-4">
              {timeline.buckets.map((bucket) => (
                <div key={bucket.key} className="min-w-0 flex-1 text-center">
                  <p className="text-xs font-medium text-slate-700">{bucket.label}</p>
                  <p className="text-[10px] text-slate-400">{bucket.subLabel}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
            {TIMELINE_SERIES.map((series) => (
              <Link
                key={series.key}
                href={series.href}
                className="group flex items-center justify-between gap-2 rounded-lg px-2 py-1 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <span className="flex min-w-0 items-center gap-2 text-xs text-slate-600">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: series.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate group-hover:text-slate-900">{series.label}</span>
                </span>
                <span className="flex items-center gap-1 text-xs font-medium tabular-nums text-slate-700">
                  {formatValue(timeline.totals[series.key])}
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-brand-600" />
                </span>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {TIMELINE_SERIES.map((series) => {
            const seriesTotal = metric === 'value' ? timeline.totals[series.key] : timeline.counts[series.key]
            const seriesMax = Math.max(
              ...timeline.buckets.map((bucket) => seriesValue(bucket, series.key)),
              1
            )

            return (
              <div key={series.key} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={series.href}
                    className="group inline-flex items-center gap-1 text-xs font-semibold text-slate-800 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    {series.label}
                    <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-brand-600" />
                  </Link>
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: series.color }}
                    aria-hidden="true"
                  />
                </div>

                <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">
                  {formatValue(seriesTotal)}
                </p>
                <p className="text-[11px] text-slate-500">
                  {timeline.counts[series.key]} document
                  {timeline.counts[series.key] === 1 ? '' : 's'} · max {formatAxis(seriesMax)}
                </p>

                <div className="mt-3 flex gap-1">
                  {timeline.buckets.map((bucket) => {
                    const value = seriesValue(bucket, series.key)

                    return (
                      <span
                        key={bucket.key}
                        className="min-w-0 flex-1 truncate text-center text-[10px] font-medium tabular-nums text-slate-600"
                        title={formatValue(value)}
                      >
                        {value > 0 ? formatAxis(value) : ''}
                      </span>
                    )
                  })}
                </div>

                <div className="relative mt-1 h-28">
                  {[0, 50, 100].map((percent) => (
                    <div
                      key={percent}
                      className="absolute inset-x-0 border-t border-dashed border-slate-200"
                      style={{ bottom: `${percent}%` }}
                      aria-hidden="true"
                    />
                  ))}

                  <div className="absolute inset-0 flex items-end gap-1">
                    {timeline.buckets.map((bucket) => {
                      const value = seriesValue(bucket, series.key)
                      const height = value > 0 ? Math.max((value / seriesMax) * 100, 2) : 0

                      return (
                        <div key={bucket.key} className="flex h-full flex-1 items-end">
                          <div
                            className="w-full rounded-t-sm transition-opacity hover:opacity-75"
                            style={{ height: `${height}%`, backgroundColor: series.color }}
                            title={`${bucket.fullLabel}: ${formatValue(value)}`}
                            aria-label={`${bucket.fullLabel}: ${formatValue(value)}`}
                            role="img"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-2 flex gap-1">
                  {timeline.buckets.map((bucket) => (
                    <span
                      key={bucket.key}
                      className="flex-1 text-center text-[10px] text-slate-500"
                      title={bucket.fullLabel}
                    >
                      {bucket.label}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function toggleClass(active: boolean) {
  return [
    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
  ].join(' ')
}
