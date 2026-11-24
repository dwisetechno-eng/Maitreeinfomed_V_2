import { monthKey, parseDateValue, toNumber } from '@/lib/dashboard'

export type ReceiptLike = {
  receipt_date: string | null
  created_at?: string | null
  amount_received: number | string | null
}

export type ReceiptMonthGroup<T extends ReceiptLike> = {
  key: string
  label: string
  fullLabel: string
  receipts: T[]
  count: number
  total: number
}

const UNDATED_KEY = '__undated__'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function receiptMonthKey(receipt: ReceiptLike): string {
  const date = parseDateValue(receipt.receipt_date) ?? parseDateValue(receipt.created_at)

  return date ? monthKey(date) : UNDATED_KEY
}

function monthLabel(key: string, full: boolean): string {
  if (key === UNDATED_KEY) {
    return 'Undated'
  }

  const date = new Date(`${key}-01T00:00:00.000Z`)

  return new Intl.DateTimeFormat('en-IN', {
    month: full ? 'long' : 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/** Groups receipts into descending month buckets, with the oldest undated receipts last. */
export function groupReceiptsByMonth<T extends ReceiptLike>(
  receipts: T[]
): ReceiptMonthGroup<T>[] {
  const groups = new Map<string, ReceiptMonthGroup<T>>()

  for (const receipt of receipts) {
    const key = receiptMonthKey(receipt)
    let group = groups.get(key)

    if (!group) {
      group = {
        key,
        label: monthLabel(key, false),
        fullLabel: monthLabel(key, true),
        receipts: [],
        count: 0,
        total: 0,
      }
      groups.set(key, group)
    }

    group.receipts.push(receipt)
    group.count += 1
    group.total = roundMoney(group.total + toNumber(receipt.amount_received))
  }

  return [...groups.values()].sort((left, right) => {
    if (left.key === UNDATED_KEY) {
      return 1
    }

    if (right.key === UNDATED_KEY) {
      return -1
    }

    return right.key.localeCompare(left.key)
  })
}
