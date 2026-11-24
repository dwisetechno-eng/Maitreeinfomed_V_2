import { describe, expect, it } from 'vitest'

import { groupReceiptsByMonth } from '@/lib/receipt-grouping'

describe('groupReceiptsByMonth', () => {
  it('groups by receipt month, newest first, with summed amounts', () => {
    const groups = groupReceiptsByMonth([
      { id: 'r1', receipt_date: '2026-03-02', amount_received: 100 },
      { id: 'r2', receipt_date: '2026-03-20', amount_received: 250 },
      { id: 'r3', receipt_date: '2026-02-11', amount_received: '75.5' },
    ])

    expect(groups.map((group) => group.key)).toEqual(['2026-03', '2026-02'])
    expect(groups[0].label).toBe('Mar 2026')
    expect(groups[0].fullLabel).toBe('March 2026')
    expect(groups[0].count).toBe(2)
    expect(groups[0].total).toBe(350)
    expect(groups[0].receipts.map((receipt) => receipt.id)).toEqual(['r1', 'r2'])
    expect(groups[1].total).toBe(75.5)
  })

  it('falls back to created_at and keeps undated receipts in their own group', () => {
    const groups = groupReceiptsByMonth([
      { id: 'r1', receipt_date: null, amount_received: 10, created_at: '2026-04-01' },
      { id: 'r2', receipt_date: null, amount_received: 20, created_at: null },
      { id: 'r3', receipt_date: '2026-04-14', amount_received: 30 },
    ])

    expect(groups.map((group) => group.key)).toEqual(['2026-04', '__undated__'])
    expect(groups[0].count).toBe(2)
    expect(groups[0].total).toBe(40)
    expect(groups[1].label).toBe('Undated')
    expect(groups[1].total).toBe(20)
  })
})
