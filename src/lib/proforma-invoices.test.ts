import { describe, expect, it } from 'vitest'

import { roundMoney } from '@/lib/proforma-invoices'

describe('roundMoney', () => {
  it('rounds to 2 decimals', () => {
    expect(roundMoney(1.234)).toBe(1.23)
    expect(roundMoney(1.236)).toBe(1.24)
    expect(roundMoney(2.4)).toBe(2.4)
    expect(roundMoney(100)).toBe(100)
  })

  it('handles nullish/NaN safely', () => {
    expect(Number.isFinite(roundMoney(NaN))).toBe(false)
  })
})
