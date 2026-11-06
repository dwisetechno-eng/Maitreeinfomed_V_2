'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import { InboxIcon } from '@/components/ui/icons'
import type { DashboardArticle, StatusMasterRow } from '@/lib/dashboard'

type StatusRow = {
  key: string
  code: string | null
  label: string
  description: string | null
  count: number
  percent: number
  isBottleneck: boolean
}

type StatusBreakdownProps = {
  articles: DashboardArticle[]
  statuses: StatusMasterRow[]
}

const UNASSIGNED_KEY = '__unassigned__'

export function StatusBreakdown({ articles, statuses }: StatusBreakdownProps) {
  const breakdown = useMemo(() => buildBreakdown(articles, statuses), [articles, statuses])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Status breakdown</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Where the {breakdown.total} article request{breakdown.total === 1 ? '' : 's'} sit right
            now. Click a status to open it.
          </p>
        </div>
        <Link
          href="/article-requests"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {breakdown.total === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
          <InboxIcon className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-900">No article requests yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Status counts appear once requests are captured and moved through the lifecycle.
          </p>
        </div>
      ) : (
        <>
          {breakdown.bottleneck && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              <p className="text-xs text-amber-800">
                Largest queue: <span className="font-semibold">{breakdown.bottleneck.label}</span>{' '}
                with {breakdown.bottleneck.count} request
                {breakdown.bottleneck.count === 1 ? '' : 's'} (
                {Math.round(breakdown.bottleneck.percent)}%).
              </p>
            </div>
          )}

          <div className="mt-4 space-y-3.5">
            {breakdown.rows.map((row) => (
              <Link
                key={row.key}
                href={
                  row.code
                    ? `/article-requests?status=${encodeURIComponent(row.code)}`
                    : '/article-requests'
                }
                className="-mx-2 block rounded-lg px-2 py-1 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                title={`Open article requests · ${row.label}`}
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
                    {row.isBottleneck && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Largest
                      </span>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="text-sm font-semibold tabular-nums text-slate-900">
                      {row.count}
                    </span>
                    <span className="ml-1 text-xs tabular-nums text-slate-400">
                      {Math.round(row.percent)}%
                    </span>
                  </div>
                </div>

                <div
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuenow={Math.round(row.percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${row.label}: ${row.count} of ${breakdown.total} articles`}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      width: `${row.percent}%`,
                      backgroundColor: row.isBottleneck ? '#e11d48' : row.code ? '#059669' : '#94a3b8',
                    }}
                  />
                </div>

                {row.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{row.description}</p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function buildBreakdown(articles: DashboardArticle[], statuses: StatusMasterRow[]) {
  const counts = new Map<string, number>()
  let unassigned = 0

  for (const article of articles) {
    if (article.status_code) {
      counts.set(article.status_code, (counts.get(article.status_code) ?? 0) + 1)
    } else {
      unassigned += 1
    }
  }

  const total = articles.length
  const known = new Set(statuses.map((status) => status.status_code))

  const base = statuses.map((status) => ({
    key: status.status_code,
    code: status.status_code,
    label: status.status_label,
    description: status.description,
    order: status.display_order ?? 0,
    count: counts.get(status.status_code) ?? 0,
  }))

  for (const [code, count] of counts.entries()) {
    if (!known.has(code)) {
      base.push({
        key: code,
        code,
        label: code,
        description: null,
        order: Number.MAX_SAFE_INTEGER,
        count,
      })
    }
  }

  base.sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order
    }

    return left.label.localeCompare(right.label)
  })

  const rows = base.map<StatusRow>((row) => ({
    key: row.key,
    code: row.code,
    label: row.label,
    description: row.description,
    count: row.count,
    percent: total > 0 ? (row.count / total) * 100 : 0,
    isBottleneck: false,
  }))

  if (unassigned > 0) {
    rows.push({
      key: UNASSIGNED_KEY,
      code: null,
      label: 'Unassigned',
      description: 'Requests without a lifecycle status.',
      count: unassigned,
      percent: total > 0 ? (unassigned / total) * 100 : 0,
      isBottleneck: false,
    })
  }

  // Only surface statuses that are actually in use, but keep their configured
  // order so the widget mirrors the lifecycle.
  const activeRows = rows.filter((row) => row.count > 0)
  const maxCount = activeRows.reduce((max, row) => Math.max(max, row.count), 0)
  const bottleneckRow = activeRows.find((row) => row.count === maxCount) ?? null

  const markedRows = activeRows.map((row) => ({
    ...row,
    isBottleneck: row.count === maxCount && maxCount > 0,
  }))

  return {
    total,
    rows: markedRows,
    maxCount,
    bottleneck: bottleneckRow
      ? markedRows.find((row) => row.key === bottleneckRow.key) ?? null
      : null,
  }
}
