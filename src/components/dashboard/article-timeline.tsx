'use client'

import { useMemo, useState } from 'react'

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

type TimelineMonth = {
  key: string
  label: string
  year: string
  fullLabel: string
  total: number
}

const MONTHS_TO_SHOW = 6
const GROUP_COLORS = ['#059669', '#0ea5e9', '#f59e0b', '#8b5cf6', '#94a3b8']
const OTHER_COLOR = '#94a3b8'

type ArticleTimelineProps = {
  articles: DashboardArticle[]
  departments: NamedOption[]
  clients: NamedOption[]
}

export function ArticleTimeline({ articles, departments, clients }: ArticleTimelineProps) {
  const [dimension, setDimension] = useState<TimelineDimension>('department')

  const timeline = useMemo(
    () => buildTimeline(articles, dimension, departments, clients),
    [articles, clients, departments, dimension]
  )

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Article request timeline</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Requests per month, stacked by {dimension}. Last {MONTHS_TO_SHOW} months in the data.
          </p>
        </div>

        <div
          className="inline-flex shrink-0 rounded-lg bg-slate-100 p-1"
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

      {!timeline.hasData ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center">
          <ChartBarIcon className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-900">No article requests to chart</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Requests appear here once they are captured with a request date.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
            <span>{timeline.rangeLabel}</span>
            <span>
              Peak month: <span className="font-medium text-slate-700">{timeline.peakTotal}</span>{' '}
              request{timeline.peakTotal === 1 ? '' : 's'}
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

              <div className="absolute inset-0 flex items-end gap-2 sm:gap-4">
                {timeline.months.map((month, monthIndex) => {
                  const totalHeight = (month.total / timeline.maxTotal) * 100
                  const barHeight = month.total > 0 ? Math.max(totalHeight, 2) : 0

                  return (
                    <div key={month.key} className="flex h-full flex-1 flex-col justify-end">
                      <div className="relative flex h-full items-end">
                        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-medium tabular-nums text-slate-600">
                          {month.total > 0 ? month.total : ''}
                        </span>

                        <div
                          className="flex w-full flex-col-reverse overflow-hidden rounded-t-md"
                          style={{ height: `${barHeight}%` }}
                          title={`${month.fullLabel}: ${month.total} request${
                            month.total === 1 ? '' : 's'
                          }`}
                        >
                          {timeline.groups.map((group) => {
                            const count = group.counts[monthIndex]

                            if (count === 0) {
                              return null
                            }

                            return (
                              <div
                                key={group.key}
                                style={{
                                  height: `${(count / month.total) * 100}%`,
                                  backgroundColor: group.color,
                                }}
                                title={`${group.name}: ${count}`}
                              />
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-2 flex gap-2 sm:gap-4">
              {timeline.months.map((month) => (
                <div key={month.key} className="flex-1 text-center">
                  <p className="text-xs font-medium text-slate-700">{month.label}</p>
                  <p className="text-[10px] text-slate-400">{month.year}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3">
            {timeline.groups.map((group) => (
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

function buildTimeline(
  articles: DashboardArticle[],
  dimension: TimelineDimension,
  departments: NamedOption[],
  clients: NamedOption[]
): {
  months: TimelineMonth[]
  groups: TimelineGroup[]
  maxTotal: number
  peakTotal: number
  rangeLabel: string
  hasData: boolean
} {
  const nameMap = new Map(
    (dimension === 'department' ? departments : clients).map((option) => [option.id, option.name])
  )

  let latest: Date | null = null

  for (const article of articles) {
    const date = parseDateValue(article.request_date) ?? parseDateValue(article.created_at)

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

  const months: TimelineMonth[] = monthDates.map((date) => ({
    key: monthKey(date),
    label: monthFormatter.format(date),
    year: yearFormatter.format(date),
    fullLabel: fullFormatter.format(date),
    total: 0,
  }))

  const monthIndexByKey = new Map(months.map((month, index) => [month.key, index]))
  const matrix = new Map<string, number[]>()

  for (const article of articles) {
    const date = parseDateValue(article.request_date) ?? parseDateValue(article.created_at)

    if (!date) {
      continue
    }

    const monthIndex = monthIndexByKey.get(monthKey(date))

    if (monthIndex == null) {
      continue
    }

    const rawKey =
      (dimension === 'department' ? article.department_id : article.client_id) ?? '__unassigned__'
    const counts = matrix.get(rawKey) ?? new Array(MONTHS_TO_SHOW).fill(0)
    counts[monthIndex] += 1
    matrix.set(rawKey, counts)
    months[monthIndex].total += 1
  }

  const sortedKeys = [...matrix.entries()]
    .map(([key, counts]) => ({
      key,
      counts,
      total: counts.reduce((sum, count) => sum + count, 0),
    }))
    .sort((left, right) => right.total - left.total)

  const groups: TimelineGroup[] = sortedKeys.slice(0, GROUP_COLORS.length - 1).map((entry, index) => ({
    key: entry.key,
    name: displayName(entry.key, nameMap),
    color: GROUP_COLORS[index] ?? OTHER_COLOR,
    counts: entry.counts,
    total: entry.total,
  }))

  const remaining = sortedKeys.slice(GROUP_COLORS.length - 1)

  if (remaining.length > 0) {
    const counts = new Array(MONTHS_TO_SHOW).fill(0)

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

  const peakTotal = months.reduce((max, month) => Math.max(max, month.total), 0)
  const hasData = peakTotal > 0
  const first = months[0]
  const last = months[months.length - 1]

  return {
    months,
    groups,
    maxTotal: Math.max(peakTotal, 1),
    peakTotal,
    rangeLabel:
      first && last
        ? first.fullLabel === last.fullLabel
          ? last.fullLabel
          : `${first.fullLabel} – ${last.fullLabel}`
        : '',
    hasData,
  }
}

function displayName(key: string, nameMap: Map<string, string>) {
  if (key === '__unassigned__') {
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
