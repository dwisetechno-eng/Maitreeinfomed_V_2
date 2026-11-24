import { describe, expect, it } from 'vitest'

import { nextTableSort, sortTableRows, type TableSort } from '@/lib/table-sort'

type Row = { name: string; amount: number | null }

type SortKey = 'name' | 'amount'

const accessors = {
  name: (row: Row) => row.name,
  amount: (row: Row) => row.amount,
}

const rows: Row[] = [
  { name: 'Beta', amount: 200 },
  { name: 'alpha', amount: null },
  { name: 'Gamma', amount: 100 },
]

describe('nextTableSort', () => {
  it('selects the requested column with its default direction', () => {
    expect(nextTableSort(null, 'amount', 'desc')).toEqual({ key: 'amount', direction: 'desc' })
  })

  it('toggles the direction when the active column is clicked again', () => {
    const current: TableSort<SortKey> = { key: 'name', direction: 'asc' }
    expect(nextTableSort(current, 'name')).toEqual({ key: 'name', direction: 'desc' })
  })
})

describe('sortTableRows', () => {
  it('sorts numbers in both directions', () => {
    expect(
      sortTableRows(rows, { key: 'amount', direction: 'asc' }, accessors).map((row) => row.name)
    ).toEqual(['Gamma', 'Beta', 'alpha'])
    expect(
      sortTableRows(rows, { key: 'amount', direction: 'desc' }, accessors).map((row) => row.name)
    ).toEqual(['Beta', 'Gamma', 'alpha'])
  })

  it('sorts text without case sensitivity', () => {
    expect(
      sortTableRows(rows, { key: 'name', direction: 'asc' }, accessors).map((row) => row.name)
    ).toEqual(['alpha', 'Beta', 'Gamma'])
  })

  it('keeps empty values at the end in both directions', () => {
    const sorted = sortTableRows(rows, { key: 'amount', direction: 'asc' }, accessors)
    expect(sorted[sorted.length - 1].amount).toBeNull()
  })

  it('uses the fallback order when no column is selected', () => {
    const fallback = (a: Row, b: Row) => b.name.localeCompare(a.name)
    expect(sortTableRows(rows, null, accessors, fallback).map((row) => row.name)).toEqual([
      'Gamma',
      'Beta',
      'alpha',
    ])
  })

  it('does not mutate the input array', () => {
    const original = rows.map((row) => row.name)
    sortTableRows(rows, { key: 'name', direction: 'desc' }, accessors)
    expect(rows.map((row) => row.name)).toEqual(original)
  })
})
