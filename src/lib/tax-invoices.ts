/**
 * Shared tax invoice helpers: numbering, proforma totals and status derivation.
 */

export const TAX_INVOICE_NUMBER_PREFIX = 'TI'
export const DEFAULT_TAX_RATE = 18

export type TaxInvoiceRow = {
  id: string
  tax_invoice_number: string | null
  client_id: string | null
  invoice_date: string | null
  subtotal: number | null
  tax_total: number | null
  grand_total: number | null
  status_code: string | null
  amount_paid?: number | null
  is_emailed?: boolean | null
  po_number?: string | null
  po_date?: string | null
  notes?: string | null
  document_content?: string | null
  created_at: string | null
}

export type TaxClientOption = { id: string; company_name: string }

export type TaxStatusOption = {
  status_code: string
  status_label: string
  display_order: number | null
}

export type ProformaForTaxInvoice = {
  id: string
  pi_number: string | null
  pi_date?: string | null
  invoice_date: string | null
  client_id: string | null
  subtotal: number | null
  tax_rate?: number | null
  tax_total?: number | null
  tax_amount?: number | null
  grand_total: number | null
  status_code: string | null
  tax_invoice_id?: string | null
  created_at: string | null
}

export type ProformaLinkSnapshot = {
  id: string
  status_code: string | null
  tax_invoice_id: string | null
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getTaxInvoiceNumberPrefix(date: string = todayIsoDate()): string {
  return `${TAX_INVOICE_NUMBER_PREFIX}-${date.slice(0, 7).replace('-', '')}-`
}

/** Next `TI-YYYYMM-XXXX` suggestion based on the numbers already in the table. */
export function nextTaxInvoiceNumber(
  existingNumbers: Array<string | null | undefined>,
  date: string = todayIsoDate()
): string {
  const prefix = getTaxInvoiceNumberPrefix(date)
  let highest = 0

  for (const value of existingNumbers) {
    const number = (value ?? '').trim()

    if (!number.startsWith(prefix)) {
      continue
    }

    const match = /^(\d+)$/.exec(number.slice(prefix.length))

    if (match) {
      highest = Math.max(highest, Number(match[1]))
    }
  }

  return `${prefix}${String(highest + 1).padStart(4, '0')}`
}

/** GST total for a proforma invoice across the schema variants we support. */
export function proformaTaxAmount(proforma: ProformaForTaxInvoice): number {
  if (typeof proforma.tax_amount === 'number' && Number.isFinite(proforma.tax_amount)) {
    return roundMoney(proforma.tax_amount)
  }

  if (typeof proforma.tax_total === 'number' && Number.isFinite(proforma.tax_total)) {
    return roundMoney(proforma.tax_total)
  }

  return roundMoney(
    Math.max(0, toNumber(proforma.grand_total) - toNumber(proforma.subtotal))
  )
}

export function proformaGrandTotal(proforma: ProformaForTaxInvoice): number {
  const grand = toNumber(proforma.grand_total)

  if (grand > 0) {
    return roundMoney(grand)
  }

  return roundMoney(toNumber(proforma.subtotal) + proformaTaxAmount(proforma))
}

/**
 * Statuses are stored when a payment is allocated. Older rows may have no
 * status, so fall back to the paid balance. `OVERDUE` is always stored
 * explicitly because there is no due date to derive it from.
 */
export function effectiveTaxStatus(
  invoice: Pick<TaxInvoiceRow, 'status_code' | 'amount_paid' | 'grand_total'>
): string {
  const stored = (invoice.status_code ?? '').trim().toUpperCase()

  if (stored) {
    return stored
  }

  const total = toNumber(invoice.grand_total)
  const paid = toNumber(invoice.amount_paid)

  if (total > 0 && paid + 0.005 >= total) {
    return 'PAID'
  }

  if (paid > 0.005) {
    return 'PARTIALLY_PAID'
  }

  return 'UNPAID'
}

/** Read the fallback proforma ids stored before the link migration ran. */
export function parseLinkedProformaIds(
  documentContent: string | null | undefined
): string[] {
  if (!documentContent) {
    return []
  }

  try {
    const parsed = JSON.parse(documentContent) as {
      source?: unknown
      proforma_invoice_ids?: unknown
    }

    if (parsed.source !== 'PROFORMA' || !Array.isArray(parsed.proforma_invoice_ids)) {
      return []
    }

    return parsed.proforma_invoice_ids.filter(
      (value): value is string => typeof value === 'string'
    )
  } catch {
    return []
  }
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}
