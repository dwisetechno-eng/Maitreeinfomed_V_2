import {
  addMonthsUtc,
  invoiceValue,
  monthKey,
  parseDateValue,
  startOfMonthUtc,
  toNumber,
  type DashboardReceipt,
  type InvoiceRow,
} from '@/lib/dashboard'

export type TimelineSeriesKey = 'proforma' | 'tax' | 'receipts'
export type TimelineMetric = 'value' | 'count'

export type TimelineSeries = {
  key: TimelineSeriesKey
  label: string
  shortLabel: string
  href: string
  color: string
}

export type InvoiceTimelineBucket = {
  key: string
  label: string
  subLabel: string
  fullLabel: string
  values: Record<TimelineSeriesKey, number>
  counts: Record<TimelineSeriesKey, number>
  /** Sum of the selected metric across all three series. */
  total: number
}

export type InvoiceTimeline = {
  buckets: InvoiceTimelineBucket[]
  totals: Record<TimelineSeriesKey, number>
  counts: Record<TimelineSeriesKey, number>
  maxTotal: number
  peakTotal: number
  rangeLabel: string
  hasData: boolean
}

export const TIMELINE_SERIES: TimelineSeries[] = [
  {
    key: 'proforma',
    label: 'Proforma invoices',
    shortLabel: 'Proforma',
    href: '/proforma-invoices',
    color: '#0284c7',
  },
  {
    key: 'tax',
    label: 'Tax invoices',
    shortLabel: 'Tax invoice',
    href: '/tax-invoices',
    color: '#059669',
  },
  {
    key: 'receipts',
    label: 'Payment receipts',
    shortLabel: 'Receipts',
    href: '/payment-receipts',
    color: '#f59e0b',
  },
]

const DEFAULT_MONTHS_TO_SHOW = 6

type BuildInvoiceTimelineOptions = {
  proforma: InvoiceRow[]
  tax: InvoiceRow[]
  receipts: DashboardReceipt[]
  metric?: TimelineMetric
  monthsToShow?: number
  referenceDate?: Date
}

function emptySeriesRecord(): Record<TimelineSeriesKey, number> {
  return { proforma: 0, tax: 0, receipts: 0 }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function documentDate(
  value: string | null | undefined,
  fallback: string | null | undefined
): Date | null {
  return parseDateValue(value) ?? parseDateValue(fallback)
}

export function buildInvoiceTimeline({
  proforma,
  tax,
  receipts,
  metric = 'value',
  monthsToShow = DEFAULT_MONTHS_TO_SHOW,
  referenceDate = new Date(),
}: BuildInvoiceTimelineOptions): InvoiceTimeline {
  const documents: { date: Date | null }[] = [
    ...proforma.map((invoice) => ({
      date: documentDate(invoice.pi_date ?? invoice.invoice_date, invoice.created_at),
    })),
    ...tax.map((invoice) => ({
      date: documentDate(invoice.invoice_date, invoice.created_at),
    })),
    ...receipts.map((receipt) => ({
      date: documentDate(receipt.receipt_date, receipt.created_at),
    })),
  ]

  let latest: Date | null = null

  for (const document of documents) {
    if (document.date && (!latest || document.date.getTime() > latest.getTime())) {
      latest = document.date
    }
  }

  const end = startOfMonthUtc(latest ?? referenceDate)
  const monthDates = Array.from({ length: monthsToShow }, (_, index) =>
    addMonthsUtc(end, index - (monthsToShow - 1))
  )

  const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' })
  const yearFormatter = new Intl.DateTimeFormat('en-IN', { year: 'numeric', timeZone: 'UTC' })
  const fullFormatter = new Intl.DateTimeFormat('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })

  const buckets: InvoiceTimelineBucket[] = monthDates.map((date) => {
    return {
      key: monthKey(date),
      label: monthFormatter.format(date),
      subLabel: yearFormatter.format(date),
      fullLabel: fullFormatter.format(date),
      values: emptySeriesRecord(),
      counts: emptySeriesRecord(),
      total: 0,
    }
  })

  const bucketIndexByKey = new Map(buckets.map((bucket, index) => [bucket.key, index]))

  function addDocument(date: Date | null, series: TimelineSeriesKey, value: number) {
    if (!date) {
      return
    }

    const index = bucketIndexByKey.get(monthKey(date))

    if (index == null) {
      return
    }

    const bucket = buckets[index]
    bucket.values[series] = roundMoney(bucket.values[series] + value)
    bucket.counts[series] += 1
    bucket.total = roundMoney(bucket.total + (metric === 'value' ? value : 1))
  }

  for (const invoice of proforma) {
    addDocument(
      documentDate(invoice.pi_date ?? invoice.invoice_date, invoice.created_at),
      'proforma',
      metric === 'value' ? invoiceValue(invoice) : 1
    )
  }

  for (const invoice of tax) {
    addDocument(
      documentDate(invoice.invoice_date, invoice.created_at),
      'tax',
      metric === 'value' ? invoiceValue(invoice) : 1
    )
  }

  for (const receipt of receipts) {
    addDocument(
      documentDate(receipt.receipt_date, receipt.created_at),
      'receipts',
      metric === 'value' ? toNumber(receipt.amount_received) : 1
    )
  }

  const totals = emptySeriesRecord()
  const counts = emptySeriesRecord()

  for (const bucket of buckets) {
    for (const series of TIMELINE_SERIES) {
      totals[series.key] = roundMoney(totals[series.key] + bucket.values[series.key])
      counts[series.key] += bucket.counts[series.key]
    }
  }

  const peakTotal = buckets.reduce((max, bucket) => Math.max(max, bucket.total), 0)
  const first = buckets[0]
  const last = buckets[buckets.length - 1]

  return {
    buckets,
    totals,
    counts,
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

export function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number.isFinite(value) ? value : 0)
}
