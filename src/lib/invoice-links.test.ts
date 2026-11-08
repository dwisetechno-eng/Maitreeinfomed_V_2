import { describe, expect, it } from 'vitest'

import {
  COMPLETED_STATUS,
  PI_GENERATED_STATUS,
  deriveArticleStatus,
} from '@/lib/invoice-links'

describe('deriveArticleStatus', () => {
  it('returns stored status when not linked', () => {
    expect(
      deriveArticleStatus({ status_code: 'DRAFT', proforma_invoice_id: null, tax_invoice_id: null })
    ).toBe('DRAFT')
  })

  it('returns PI_GENERATED when on a proforma', () => {
    expect(
      deriveArticleStatus(
        { status_code: 'DRAFT', proforma_invoice_id: 'p1', tax_invoice_id: null },
        'UNPAID'
      )
    ).toBe(PI_GENERATED_STATUS)
  })

  it('restores stored status when proforma is cancelled', () => {
    expect(
      deriveArticleStatus(
        { status_code: 'DRAFT', proforma_invoice_id: 'p1', tax_invoice_id: null },
        'CANCELLED'
      )
    ).toBe('DRAFT')
  })

  it('returns COMPLETED when tax invoice is paid', () => {
    expect(
      deriveArticleStatus(
        { status_code: 'DRAFT', proforma_invoice_id: 'p1', tax_invoice_id: 't1' },
        'UNPAID',
        'PAID'
      )
    ).toBe(COMPLETED_STATUS)
  })

  it('returns PI_GENERATED when tax invoice is unpaid', () => {
    expect(
      deriveArticleStatus(
        { status_code: 'DRAFT', proforma_invoice_id: 'p1', tax_invoice_id: 't1' },
        'UNPAID',
        'UNPAID'
      )
    ).toBe(PI_GENERATED_STATUS)
  })
})
