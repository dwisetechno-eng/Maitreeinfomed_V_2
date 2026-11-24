import { describe, expect, it } from 'vitest'

import {
  buildInvoiceTimeline,
  type TimelineSeriesKey,
} from '@/lib/invoice-timeline'
import type { DashboardReceipt, InvoiceRow } from '@/lib/dashboard'

const referenceDate = new Date('2026-04-15T00:00:00.000Z')

function proforma(id: string, date: string, total: number): InvoiceRow {
  return { id, pi_date: date, subtotal: total, grand_total: total }
}

function tax(id: string, date: string, total: number): InvoiceRow {
  return { id, invoice_date: date, subtotal: total, grand_total: total }
}

function receipt(id: string, date: string | null, amount: number, createdAt?: string): DashboardReceipt {
  return { id, receipt_date: date, amount_received: amount, created_at: createdAt }
}

function valuesFor(
  buckets: ReturnType<typeof buildInvoiceTimeline>['buckets'],
  series: TimelineSeriesKey
): number[] {
  return buckets.map((bucket) => bucket.values[series])
}

describe('buildInvoiceTimeline', () => {
  it('builds six months ending at the latest document month', () => {
    const timeline = buildInvoiceTimeline({
      proforma: [proforma('p1', '2026-02-10', 100)],
      tax: [tax('t1', '2026-03-12', 200)],
      receipts: [receipt('r1', '2026-03-14', 50)],
      referenceDate,
    })

    expect(timeline.buckets.map((bucket) => bucket.key)).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ])
    expect(timeline.rangeLabel).toBe('Oct 2025 – Mar 2026')
    expect(timeline.totals).toEqual({ proforma: 100, tax: 200, receipts: 50 })
    expect(timeline.peakTotal).toBe(250)
  })

  it('aggregates each series by value and by count', () => {
    const options = {
      proforma: [proforma('p1', '2026-03-02', 100), proforma('p2', '2026-03-20', 250)],
      tax: [tax('t1', '2026-03-11', 400)],
      receipts: [receipt('r1', '2026-03-15', 60), receipt('r2', '2026-03-18', 40)],
      referenceDate,
    }

    const byValue = buildInvoiceTimeline(options)
    expect(valuesFor(byValue.buckets, 'proforma')).toEqual([0, 0, 0, 0, 0, 350])
    expect(valuesFor(byValue.buckets, 'tax')).toEqual([0, 0, 0, 0, 0, 400])
    expect(valuesFor(byValue.buckets, 'receipts')).toEqual([0, 0, 0, 0, 0, 100])
    expect(byValue.buckets[5].total).toBe(850)

    const byCount = buildInvoiceTimeline({ ...options, metric: 'count' })
    expect(byCount.buckets[5].counts).toEqual({ proforma: 2, tax: 1, receipts: 2 })
    expect(byCount.buckets[5].total).toBe(5)
    expect(byCount.totals).toEqual({ proforma: 2, tax: 1, receipts: 2 })
  })

  it('falls back to created_at and ignores documents outside the window', () => {
    const timeline = buildInvoiceTimeline({
      proforma: [proforma('p1', '2026-03-02', 100)],
      tax: [{ id: 't1', subtotal: 900, grand_total: 900, created_at: '2024-01-10' }],
      receipts: [receipt('r1', null, 75, '2026-03-05')],
      referenceDate,
    })

    expect(timeline.totals).toEqual({ proforma: 100, tax: 0, receipts: 75 })
    expect(timeline.buckets[5].counts).toEqual({ proforma: 1, tax: 0, receipts: 1 })
  })

  it('reports an empty timeline when there are no documents', () => {
    const timeline = buildInvoiceTimeline({
      proforma: [],
      tax: [],
      receipts: [],
      referenceDate,
    })

    expect(timeline.hasData).toBe(false)
    expect(timeline.maxTotal).toBe(1)
    expect(timeline.buckets.at(-1)?.key).toBe('2026-04')
  })
})
