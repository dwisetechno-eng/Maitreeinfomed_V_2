/**
 * Shared helpers for the "grouping" relationships between article requests,
 * proforma invoices, tax invoices and payment receipts.
 *
 * Grouping is expressed purely by foreign keys:
 *   article_requests.proforma_invoice_id → proforma_invoices.id
 *   article_requests.tax_invoice_id      → tax_invoices.id
 *   proforma_invoices.tax_invoice_id     → tax_invoices.id
 *   payment_allocations.receipt_id / tax_invoice_id
 *
 * Every mutation that adds or removes a link therefore has two jobs: move the
 * foreign keys and keep the aggregate totals/statuses consistent. The helpers
 * below do the second part so each screen does not re-implement the maths.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  getArticleQuantity,
  getArticleRate,
  type ArticleRequestRow,
} from '@/lib/article-request-meta'
import { DEFAULT_TAX_RATE, roundMoney } from '@/lib/proforma-invoices'
import { isMissingColumnError, isMissingTableError } from '@/lib/supabase-errors'
import { proformaTaxAmount, toNumber, type ProformaForTaxInvoice } from '@/lib/tax-invoices'

export const REQUEST_SENT_STATUS = 'REQUEST_SENT'
export const PI_GENERATED_STATUS = 'PI_GENERATED'
export const COMPLETED_STATUS = 'COMPLETED'

export type ArticleLinkState = {
  status_code: string | null
  proforma_invoice_id: string | null
  tax_invoice_id: string | null
}

export type ProformaTotals = {
  subtotal: number
  tax_rate: number
  tax_amount: number
  grand_total: number
}

export type TaxInvoiceTotals = {
  subtotal: number
  tax_total: number
  grand_total: number
}

/** Value of a single article request line on an invoice. */
export function articleLinkAmount(row: ArticleRequestRow): number {
  return roundMoney(getArticleRate(row) * getArticleQuantity(row))
}

/**
 * The status shown for an article request. Links always win over the stored
 * status so the column follows the invoice lifecycle:
 *
 *   on a proforma invoice        → PI_GENERATED
 *   on a tax invoice             → PI_GENERATED (or COMPLETED once paid)
 *   not on any invoice           → whatever the user last stored
 */
export function deriveArticleStatus(
  article: ArticleLinkState,
  proformaStatus?: string | null,
  taxInvoiceStatus?: string | null
): string | null {
  if (article.tax_invoice_id) {
    return (taxInvoiceStatus ?? '').trim().toUpperCase() === 'PAID'
      ? COMPLETED_STATUS
      : PI_GENERATED_STATUS
  }

  if (article.proforma_invoice_id) {
    if ((proformaStatus ?? '').trim().toUpperCase() === 'CANCELLED') {
      return article.status_code
    }

    return PI_GENERATED_STATUS
  }

  return article.status_code
}

/** Status to restore when an article is removed from an invoice. */
export async function fetchPendingArticleStatus(
  supabase: SupabaseClient,
  preferred: string = REQUEST_SENT_STATUS
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('article_status_master')
      .select('status_code')
      .order('display_order', { ascending: true })

    if (error || !data || data.length === 0) {
      return preferred
    }

    const rows = data as Array<{ status_code: string }>

    return rows.find((row) => row.status_code === preferred)?.status_code ?? rows[0].status_code
  } catch {
    return preferred
  }
}

/** Recompute a proforma invoice from its linked article requests. */
export async function recalculateProformaTotals(
  supabase: SupabaseClient,
  proformaId: string
): Promise<ProformaTotals | null> {
  const { data: invoice, error } = await supabase
    .from('proforma_invoices')
    .select('id, tax_rate')
    .eq('id', proformaId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!invoice) {
    return null
  }

  const { data: rows, error: rowsError } = await supabase
    .from('article_requests')
    .select('*')
    .eq('proforma_invoice_id', proformaId)

  if (rowsError) {
    throw rowsError
  }

  const subtotal = roundMoney(
    ((rows ?? []) as ArticleRequestRow[]).reduce(
      (total, row) => total + articleLinkAmount(row),
      0
    )
  )

  const storedRate = Number((invoice as { tax_rate?: number | null }).tax_rate)
  const taxRate =
    Number.isFinite(storedRate) && storedRate >= 0 ? storedRate : DEFAULT_TAX_RATE
  const taxAmount = roundMoney((subtotal * taxRate) / 100)
  const grandTotal = roundMoney(subtotal + taxAmount)

  const payload: Record<string, unknown> = {
    subtotal,
    tax_rate: taxRate,
    tax_amount: taxAmount,
    grand_total: grandTotal,
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error: updateError } = await supabase
      .from('proforma_invoices')
      .update(payload)
      .eq('id', proformaId)

    if (!updateError) {
      break
    }

    if (!isMissingColumnError(updateError)) {
      throw updateError
    }

    // Drop whichever optional column this database does not have yet.
    if ('tax_amount' in payload) {
      delete payload.tax_amount
    } else if ('tax_rate' in payload) {
      delete payload.tax_rate
    } else if ('subtotal' in payload) {
      delete payload.subtotal
    } else {
      throw updateError
    }
  }

  return { subtotal, tax_rate: taxRate, tax_amount: taxAmount, grand_total: grandTotal }
}

/** Recompute a tax invoice from the proforma invoices currently linked to it. */
export async function recalculateTaxInvoiceTotals(
  supabase: SupabaseClient,
  taxInvoiceId: string
): Promise<TaxInvoiceTotals | null> {
  const { data, error } = await supabase
    .from('proforma_invoices')
    .select('id, subtotal, tax_amount, tax_total, grand_total')
    .eq('tax_invoice_id', taxInvoiceId)

  if (error) {
    if (isMissingColumnError(error)) {
      return null
    }

    throw error
  }

  const proformas = (data ?? []) as unknown as ProformaForTaxInvoice[]
  const subtotal = roundMoney(
    proformas.reduce((total, proforma) => total + toNumber(proforma.subtotal), 0)
  )
  const taxTotal = roundMoney(
    proformas.reduce((total, proforma) => total + proformaTaxAmount(proforma), 0)
  )
  const grandTotal = roundMoney(subtotal + taxTotal)

  const { error: updateError } = await supabase
    .from('tax_invoices')
    .update({ subtotal, tax_total: taxTotal, grand_total: grandTotal })
    .eq('id', taxInvoiceId)

  if (updateError) {
    throw updateError
  }

  return { subtotal, tax_total: taxTotal, grand_total: grandTotal }
}

/** Recompute a tax invoice's paid amount and status from its allocations. */
export async function recalculateTaxInvoicePayment(
  supabase: SupabaseClient,
  taxInvoiceId: string
): Promise<{ amount_paid: number; status_code: string } | null> {
  const { data: allocations, error } = await supabase
    .from('payment_allocations')
    .select('amount')
    .eq('tax_invoice_id', taxInvoiceId)

  if (error) {
    if (isMissingTableError(error)) {
      return null
    }

    throw error
  }

  const amountPaid = roundMoney(
    (allocations ?? []).reduce(
      (total, allocation) =>
        total + toNumber((allocation as { amount: number | null }).amount),
      0
    )
  )

  const { data: invoice, error: invoiceError } = await supabase
    .from('tax_invoices')
    .select('grand_total, status_code')
    .eq('id', taxInvoiceId)
    .maybeSingle()

  if (invoiceError) {
    throw invoiceError
  }

  if (!invoice) {
    return null
  }

  const grandTotal = toNumber((invoice as { grand_total: number | null }).grand_total)
  const stored = ((invoice as { status_code: string | null }).status_code ?? '')
    .trim()
    .toUpperCase()

  let status: string

  if (grandTotal > 0 && amountPaid + 0.005 >= grandTotal) {
    status = 'PAID'
  } else if (stored === 'OVERDUE') {
    status = 'OVERDUE'
  } else if (amountPaid > 0.005) {
    status = 'PARTIALLY_PAID'
  } else {
    status = 'UNPAID'
  }

  let result = await supabase
    .from('tax_invoices')
    .update({ status_code: status, amount_paid: amountPaid })
    .eq('id', taxInvoiceId)

  if (result.error && isMissingColumnError(result.error)) {
    result = await supabase
      .from('tax_invoices')
      .update({ status_code: status })
      .eq('id', taxInvoiceId)
  }

  if (result.error) {
    throw result.error
  }

  return { amount_paid: amountPaid, status_code: status }
}

/** Point every article request under these proformas at a tax invoice. */
export async function linkProformaArticlesToTaxInvoice(
  supabase: SupabaseClient,
  proformaIds: string[],
  taxInvoiceId: string | null
): Promise<void> {
  if (proformaIds.length === 0) {
    return
  }

  const { error } = await supabase
    .from('article_requests')
    .update({ tax_invoice_id: taxInvoiceId, status_code: PI_GENERATED_STATUS })
    .in('proforma_invoice_id', proformaIds)

  if (error && !isMissingColumnError(error)) {
    throw error
  }
}

/** Fetch ids/statuses for the article requests under a proforma invoice. */
export async function fetchProformaArticles(
  supabase: SupabaseClient,
  proformaId: string
): Promise<ArticleRequestRow[]> {
  const { data, error } = await supabase
    .from('article_requests')
    .select('*')
    .eq('proforma_invoice_id', proformaId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as ArticleRequestRow[]
}
