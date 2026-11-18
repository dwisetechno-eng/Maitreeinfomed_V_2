import { describe, expect, it } from 'vitest'

import { assignMissingSrNumbers } from '@/lib/article-sr-no'

describe('assignMissingSrNumbers', () => {
  it('numbers blank rows from 1 in row order', () => {
    const rows = [{ srNo: null }, { srNo: null }, { srNo: null }]

    assignMissingSrNumbers(rows)

    expect(rows.map((row) => row.srNo)).toEqual([1, 2, 3])
  })

  it('keeps explicit numbers and skips them when filling blanks', () => {
    const rows = [{ srNo: null }, { srNo: 2 }, { srNo: null }, { srNo: 4 }]

    assignMissingSrNumbers(rows)

    expect(rows.map((row) => row.srNo)).toEqual([1, 2, 3, 4])
  })

  it('fills the lowest unused numbers when the sheet supplies some', () => {
    const rows = [{ srNo: 2 }, { srNo: null }, { srNo: 4 }, { srNo: null }]

    assignMissingSrNumbers(rows)

    expect(rows.map((row) => row.srNo)).toEqual([2, 1, 4, 3])
  })

  it('is a no-op when every row already has a number', () => {
    const rows = [{ srNo: 3 }, { srNo: 1 }]

    assignMissingSrNumbers(rows)

    expect(rows.map((row) => row.srNo)).toEqual([3, 1])
  })
})
