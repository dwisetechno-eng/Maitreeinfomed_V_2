'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'

import { ChartBarIcon } from '@/components/ui/icons'
import {
  addMonthsUtc,
  monthKey,
  parseDateValue,
  startOfMonthUtc,
  type DashboardArticle,
  type NamedOption,
} from '@/lib/dashboard'

type TimelineDimension = 'department' | 'client'

type TimelineGroup = {
  key: string
  name: string
  color: string
  counts: number[]
  total: number
}

type TimelineBucket = {
  key: string
  label: string
  subLabel: string
  fullLabel: string
  /** ISO date range for the bucket, used for drill-down links. */
  from: string
  to: string
  total: number
}

const MONTHS_TO_SHOW = 6
const GROUP_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#94a3b8']
const OTHER_COLOR = '#94a3b8'
const UNASSIGNED_KEY = '__unassigned__'

type ArticleTimelineProps = {
  articles: DashboardArticle[]
  departments: NamedOption[]
  clients: NamedOption[]
}

export function ArticleTimeline({ articles, departments, clients }: ArticleTimelineProps) {
  const [dimension, setDimension] = useState<TimelineDimension>('department')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)

  const monthly = useMemo(
    () => buildMonthly(articles, dimension, departments, clients),
    [articles, clients, departments, dimension]
  )

  const daily = useMemo(
    () =>
      selectedMonth ? buildDaily(articles, selectedMonth, dimension, departments, clients) : null,
    [articles, clients, departments, dimension, selectedMonth]
  )

  const view = daily ?? monthly
  const selected = selectedMonth
    ? monthly.buckets.find((bucket) => bucket.key === selectedMonth) ?? null
    : null

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                type="button"
                onClick={() => setSelectedMonth(null)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Back to monthly view"
                title="Back to months"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-sm font-semibold text-slate-900">
              {selected ? `Requests in ${selected.fullLabel}` : 'Article request timeline'}
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {selected
              ? `Requests per day, stacked by ${dimension}. Click a day to open it in Article Requests.`
              : `Requests per month, stacked by ${dimension}. Click a month to drill down by date.`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {selected && (
            <Link
              href={`/article-requests?from=${selected.from}&to=${selected.to}`}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Open month
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <div
            className="inline-flex rounded-lg bg-slate-100 p-1"
            role="group"
            aria-label="Group timeline by"
          >
            <button
              type="button"
              onClick={() => setDimension('department')}
              aria-pressed={dimension === 'department'}
              className={toggleClass(dimension === 'department')}
            >
              Department
            </button>
            <button
              type="button"
              onClick={() => setDimension('client')}
              aria-pressed={dimension === 'client'}
              className={toggleClass(dimension === 'client')}
            >
              Client
            </button>
          </div>
        </div>
      </div>

      {!view.hasData ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
          <ChartBarIcon className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-900">
            {selected ? 'No requests in this month' : 'No article requests to chart'}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {selected
              ? 'Pick another month to drill into.'
              : 'Requests appear here once they are captured with a request date.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
            <span>{view.rangeLabel}</span>
            <span>
              Peak {selected ? 'day' : 'month'}:{' '}
              <span className="font-medium text-slate-700">{view.peakTotal}</span> request
              {view.peakTotal === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-8">
            <div className="relative h-48">
              {[0, 25, 50, 75, 100].map((percent) => (
                <div
                  key={percent}
                  className="absolute inset-x-0 border-t border-dashed border-slate-200"
                  style={{ bottom: `${percent}%` }}
                  aria-hidden="true"
                />
              ))}

              <div
                className={`absolute inset-0 flex items-end ${
                  selected ? 'gap-0.5 sm:gap-1' : 'gap-2 sm:gap-4'
                }`}
              >
                {view.buckets.map((bucket, bucketIndex) => {
                  const totalHeight = (bucket.total / view.maxTotal) * 100
                  const barHeight = bucket.total > 0 ? Math.max(totalHeight, 2) : 0
                  const label = `${bucket.fullLabel}: ${bucket.total} request${
                    bucket.total === 1 ? '' : 's'
                  }`

                  const bar = (
                    <div
                      className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
                      style={{ height: `${barHeight}%` }}
                    >
                      {view.groups.map((group) => {
                        const count = group.counts[bucketIndex]

                        if (count === 0) {
                          return null
                        }

                        return (
                          <div
                            key={group.key}
                            style={{
                              height: `${(count / bucket.total) * 100}%`,
                              backgroundColor: group.color,
                            }}
                            title={`${group.name}: ${count}`}
                          />
                        )
                      })}
                    </div>
                  )

                  const interactiveClass =
                    'group relative flex h-full w-full items-end rounded-t-md transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500'

                  return (
                    <div key={bucket.key} className="flex h-full flex-1 flex-col justify-end">
                      {selected ? (
                        <Link
                          href={`/article-requests?from=${bucket.from}&to=${bucket.to}`}
                          className={interactiveClass}
                          title={`${label} · open in Article Requests`}
                          aria-label={`${label}. Open in Article Requests.`}
                        >
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium tabular-nums text-slate-600">
                            {bucket.total > 0 ? bucket.total : ''}
                          </span>
                          {bar}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedMonth(bucket.key)}
                          className={interactiveClass}
                          title={`${label} · click to see by date`}
                          aria-label={`${label}. Drill down by date.`}
                        >
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-medium tabular-nums text-slate-600">
                            {bucket.total > 0 ? bucket.total : ''}
                          </span>
                          {bar}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={`mt-2 flex ${selected ? 'gap-0.5 sm:gap-1' : 'gap-2 sm:gap-4'}`}>
              {view.buckets.map((bucket, index) => (
                <div key={bucket.key} className="min-w-0 flex-1 text-center">
                  <p
                    className={`font-medium text-slate-700 ${
                      selected ? 'text-[10px]' : 'text-xs'
                    }`}
                  >
                    {selected
                      ? index === 0 || (index + 1) % 5 === 0 || index === view.buckets.length - 1
                        ? bucket.label
                        : ''
                      : bucket.label}
                  </p>
                  {!selected && <p className="text-[10px] text-slate-400">{bucket.subLabel}</p>}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3">
            {view.groups.map((group) => (
              <div key={group.key} className="flex items-center gap-1.5 text-xs text-slate-600">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: group.color }}
                  aria-hidden="true"
                />
                <span className="max-w-40 truncate" title={group.name}>
                  {group.name}
                </span>
                <span className="tabular-nums text-slate-400">{group.total}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

type TimelineView = {
  buckets: TimelineBucket[]
  groups: TimelineGroup[]
  maxTotal: number
  peakTotal: number
  rangeLabel: string
  hasData: boolean
}

function articleDate(article: DashboardArticle): Date | null {
  return parseDateValue(article.request_date) ?? parseDateValue(article.created_at)
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildMonthly(
  articles: DashboardArticle[],
  dimension: TimelineDimension,
  departments: NamedOption[],
  clients: NamedOption[]
): TimelineView {
  let latest: Date | null = null

  for (const article of articles) {
    const date = articleDate(article)

    if (date && (!latest || date.getTime() > latest.getTime())) {
      latest = date
    }
  }

  const end = latest ? startOfMonthUtc(latest) : startOfMonthUtc(new Date())
  const monthDates = Array.from({ length: MONTHS_TO_SHOW }, (_, index) =>
    addMonthsUtc(end, index - (MONTHS_TO_SHOW - 1))
  )

  const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' })
  const yearFormatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', timeZone: 'UTC' })
  const fullFormatter = new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const buckets: TimelineBucket[] = monthDates.map((date) => {
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))

    return {
      key: monthKey(date),
      label: monthFormatter.format(date),
      subLabel: yearFormatter.format(date),
      fullLabel: fullFormatter.format(date),
      from: isoDay(date),
      to: isoDay(lastDay),
      total: 0,
    }
  })

  return aggregate(
    articles,
    buckets,
    (date) => monthKey(date),
    dimension,
    departments,
    clients
  )
}

function buildDaily(
  articles: DashboardArticle[],
  month: string,
  dimension: TimelineDimension,
  departments: NamedOption[],
  clients: NamedOption[]
): TimelineView {
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

  const fullFormatter = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const buckets: TimelineBucket[] = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, index + 1))
    const day = isoDay(date)

    return {
      key: day,
      label: String(index + 1),
      subLabel: '',
      fullLabel: fullFormatter.format(date),
      from: day,
      to: day,
      total: 0,
    }
  })

  return aggregate(articles, buckets, isoDay, dimension, departments, clients)
}

function aggregate(
  articles: DashboardArticle[],
  buckets: TimelineBucket[],
  bucketKeyFor: (date: Date) => string,
  dimension: TimelineDimension,
  departments: NamedOption[],
  clients: NamedOption[]
): TimelineView {
  const nameMap = new Map(
    (dimension === 'department' ? departments : clients).map((option) => [option.id, option.name])
  )
  const bucketIndexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]))
  const matrix = new Map<string, number[]>()

  for (const article of articles) {
    const date = articleDate(article)

    if (!date) {
      continue
    }

    const bucketIndex = bucketIndexByKey.get(bucketKeyFor(date))

    if (bucketIndex == null) {
      continue
    }

    const rawKey =
      (dimension === 'department' ? article.department_id : article.client_id) ?? UNASSIGNED_KEY
    const counts = matrix.get(rawKey) ?? new Array<number>(buckets.length).fill(0)
    counts[bucketIndex] += 1
    matrix.set(rawKey, counts)
    buckets[bucketIndex].total += 1
  }

  const sortedKeys = [...matrix.entries()]
    .map(([key, counts]) => ({
      key,
      counts,
      total: counts.reduce((sum, count) => sum + count, 0),
    }))
    .sort((left, right) => right.total - left.total)

  const groups: TimelineGroup[] = sortedKeys
    .slice(0, GROUP_COLORS.length - 1)
    .map((entry, index) => ({
      key: entry.key,
      name: displayName(entry.key, nameMap),
      color: GROUP_COLORS[index] ?? OTHER_COLOR,
      counts: entry.counts,
      total: entry.total,
    }))

  const remaining = sortedKeys.slice(GROUP_COLORS.length - 1)

  if (remaining.length > 0) {
    const counts = new Array<number>(buckets.length).fill(0)

    for (const entry of remaining) {
      entry.counts.forEach((count, index) => {
        counts[index] += count
      })
    }

    groups.push({
      key: '__other__',
      name: `Other (${remaining.length})`,
      color: OTHER_COLOR,
      counts,
      total: counts.reduce((sum, count) => sum + count, 0),
    })
  }

  const peakTotal = buckets.reduce((max, bucket) => Math.max(max, bucket.total), 0)
  const first = buckets[0]
  const last = buckets[buckets.length - 1]

  return {
    buckets,
    groups,
    maxTotal: Math.max(peakTotal, 1),
    peakTotal,
    rangeLabel:
      first && last
        ? first.fullLabel === last.fullLabel
          ? last.fullLabel
          : `${first.fullLabel} – ${last.fullLabel}`
        : '',
    hasData: peakTotal > 0,
  }
}

function displayName(key: string, nameMap: Map<string, string>) {
  if (key === UNASSIGNED_KEY) {
    return 'Unassigned'
  }

  return nameMap.get(key) ?? 'Unknown'
}

function toggleClass(active: boolean) {
  return [
    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
  ].join(' ')
}
