'use server'

/**
 * Server actions that render invoice documents and return them as base64 so the
 * table buttons can download them without exposing the Supabase session or the
 * document generators to the browser bundle.
 */

import type { ArticleRequestRow } from '@/lib/article-request-meta'
import { buildInvoiceDocumentData, type InvoiceClientInfo } from '@/lib/invoice-documents'
import { renderInvoiceDocx } from '@/lib/invoice-docx'
import { renderTaxInvoiceProofPdf } from '@/lib/invoice-proof-pdf'
import { isMissingColumnError } from '@/lib/supabase-errors'
import { createClient } from '@/utils/supabase/server'

const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type InvoiceDocumentResult =
  | {
      ok: true
      base64: string
      filename: string
      mimeType: string
    }
  | { ok: false; error: string }

type ProformaInvoiceRow = {
  id: string
  pi_number: string | null
  pi_date: string | null
  invoice_date: string | null
  client_id: string | null
  subtotal: number | null
  tax_rate: number | null
  tax_amount: number | null
  tax_total: number | null
  grand_total: number | null
  document_content: string | null
  created_at: string | null
}

type TaxInvoiceRow = {
  id: string
  tax_invoice_number: string | null
  invoice_date: string | null
  client_id: string | null
  subtotal: number | null
  tax_total: number | null
  grand_total: number | null
  po_number: string | null
  po_date: string | null
  notes: string | null
  document_content: string | null
  created_at: string | null
}

type ProformaLinkRow = {
  id: string
  pi_number: string | null
  pi_date?: string | null
  invoice_date: string | null
  client_id: string | null
  subtotal: number | null
  tax_rate?: number | null
  tax_amount?: number | null
  tax_total?: number | null
  grand_total?: number | null
  created_at: string | null
}

type ClientRow = {
  company_name: string | null
  location: string | null
  address: string | null
  city: string | null
  state: string | null
  gstin: string | null
  email: string | null
  phone: string | null
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message

    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return fallback
}

function safeFilenamePart(value: string, fallback: string): string {
  return (value.trim() || fallback).replace(/[^A-Za-z0-9._-]+/g, '-')
}

async function fetchClient(
  clientId: string | null
): Promise<ClientRow | null> {
  if (!clientId) {
    return null
  }

  const supabase = await createClient()
  const primary = await supabase
    .from('clients')
    .select('company_name, location, address, city, state, gstin, email, phone')
    .eq('id', clientId)
    .maybeSingle()

  let data = primary.data as ClientRow | null
  let error = primary.error

  // Older deployments may not have the structured address migration yet; fall
  // back to the legacy columns so downloads keep working.
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase
      .from('clients')
      .select('company_name, location, gstin, email, phone')
      .eq('id', clientId)
      .maybeSingle()

    data = fallback.data as ClientRow | null
    error = fallback.error
  }

  if (error) {
    throw error
  }

  return data
}

async function fetchDepartmentName(
  departmentId: string | null | undefined
): Promise<string | null> {
  if (!departmentId) {
    return null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('departments')
    .select('department_name')
    .eq('id', departmentId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as { department_name: string | null } | null)?.department_name ?? null
}

async function fetchContactName(
  contactId: string | null | undefined
): Promise<string | null> {
  if (!contactId) {
    return null
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_contacts')
    .select('contact_name')
    .eq('id', contactId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as { contact_name: string | null } | null)?.contact_name ?? null
}

function firstValue(
  rows: ArticleRequestRow[],
  key: 'department_id' | 'contact_id'
): string | null {
  for (const row of rows) {
    const value = row[key]

    if (value) {
      return value
    }
  }

  return null
}

function resolveInvoiceDocumentContent(invoice: {
  document_content?: string | null
  notes?: string | null
}): {
  documentContent: string | null
  notes: string | null
} {
  const raw = invoice.document_content?.trim() ?? ''

  if (!raw.startsWith('{')) {
    return { documentContent: invoice.document_content ?? null, notes: invoice.notes ?? null }
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // Keep legacy proforma-link payloads working; they are not document overrides.
    if (Array.isArray(parsed.proforma_invoice_ids) || parsed.source === 'PROFORMA') {
      return { documentContent: null, notes: invoice.notes ?? null }
    }

    return { documentContent: raw, notes: null }
  } catch {
    return { documentContent: invoice.document_content ?? null, notes: invoice.notes ?? null }
  }
}

/** Render a proforma invoice as a Word document. */
export async function downloadProformaDocument(
  invoiceId: string
): Promise<InvoiceDocumentResult> {
  try {
    if (!invoiceId?.trim()) {
      return { ok: false, error: 'Choose a proforma invoice to download.' }
    }

    const supabase = await createClient()
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('proforma_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invoiceError) {
      throw invoiceError
    }

    if (!invoiceData) {
      return { ok: false, error: 'The proforma invoice could not be found.' }
    }

    const invoice = invoiceData as ProformaInvoiceRow

    const [{ data: articleData, error: articleError }, client] = await Promise.all([
      supabase
        .from('article_requests')
        .select('*')
        .eq('proforma_invoice_id', invoiceId)
        .order('created_at', { ascending: true }),
      fetchClient(invoice.client_id),
    ])

    if (articleError) {
      throw articleError
    }

    const articles = (articleData ?? []) as ArticleRequestRow[]
    const [departmentName, contactName] = await Promise.all([
      fetchDepartmentName(firstValue(articles, 'department_id')),
      fetchContactName(firstValue(articles, 'contact_id')),
    ])

    const subtotal = Number(invoice.subtotal ?? 0)
    const storedTax = Number(invoice.tax_amount ?? 0) || Number(invoice.tax_total ?? 0)
    const taxAmount =
      storedTax || Math.max(0, Number(invoice.grand_total ?? 0) - subtotal)
    const { documentContent, notes } = resolveInvoiceDocumentContent(invoice)

    const data = buildInvoiceDocumentData({
      kind: 'PROFORMA',
      invoiceNumber: invoice.pi_number ?? invoice.id.slice(0, 8).toUpperCase(),
      invoiceDate: invoice.pi_date ?? invoice.invoice_date,
      createdAt: invoice.created_at,
      client,
      departmentName,
      contactName,
      articles,
      subtotal,
      taxAmount,
      taxRate: Number(invoice.tax_rate ?? 0),
      grandTotal: Number(invoice.grand_total ?? 0),
      documentContent,
      notes,
    })

    const buffer = await renderInvoiceDocx(data)
    const filename = `Proforma-Invoice-${safeFilenamePart(
      data.invoiceNumber,
      invoice.id.slice(0, 8)
    )}.docx`

    return {
      ok: true,
      base64: buffer.toString('base64'),
      filename,
      mimeType: DOCX_MIME_TYPE,
    }
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, 'Could not generate the proforma invoice document.'),
    }
  }
}

/** Render a tax invoice as a Word document. */
export async function downloadTaxInvoiceDocument(
  invoiceId: string
): Promise<InvoiceDocumentResult> {
  try {
    if (!invoiceId?.trim()) {
      return { ok: false, error: 'Choose a tax invoice to download.' }
    }

    const supabase = await createClient()
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('tax_invoices')
      .select('*')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invoiceError) {
      throw invoiceError
    }

    if (!invoiceData) {
      return { ok: false, error: 'The tax invoice could not be found.' }
    }

    const invoice = invoiceData as TaxInvoiceRow

    const [
      { data: articleData, error: articleError },
      { data: proformaData, error: proformaError },
      client,
    ] = await Promise.all([
      supabase
        .from('article_requests')
        .select('*')
        .eq('tax_invoice_id', invoiceId)
        .order('created_at', { ascending: true }),
      supabase
        .from('proforma_invoices')
        .select('*')
        .eq('tax_invoice_id', invoiceId)
        .order('created_at', { ascending: true }),
      fetchClient(invoice.client_id),
    ])

    if (articleError) {
      throw articleError
    }

    if (proformaError) {
      throw proformaError
    }

    const proformas = (proformaData ?? []) as ProformaLinkRow[]
    let articles = (articleData ?? []) as ArticleRequestRow[]

    // Older links may only exist on the proforma rows, so fall back to the
    // articles grouped under the linked proformas.
    if (articles.length === 0 && proformas.length > 0) {
      const { data: fallbackArticles, error: fallbackError } = await supabase
        .from('article_requests')
        .select('*')
        .in(
          'proforma_invoice_id',
          proformas.map((proforma) => proforma.id)
        )
        .order('created_at', { ascending: true })

      if (fallbackError) {
        throw fallbackError
      }

      articles = (fallbackArticles ?? []) as ArticleRequestRow[]
    }

    const [departmentName, contactName] = await Promise.all([
      fetchDepartmentName(firstValue(articles, 'department_id')),
      fetchContactName(firstValue(articles, 'contact_id')),
    ])

    const { documentContent, notes } = resolveInvoiceDocumentContent(invoice)

    const data = buildInvoiceDocumentData({
      kind: 'TAX',
      invoiceNumber:
        invoice.tax_invoice_number ?? invoice.id.slice(0, 8).toUpperCase(),
      invoiceDate: invoice.invoice_date,
      createdAt: invoice.created_at,
      client,
      departmentName,
      contactName,
      articles,
      subtotal: Number(invoice.subtotal ?? 0),
      taxAmount:
        Number(invoice.tax_total ?? 0) ||
        Math.max(
          0,
          Number(invoice.grand_total ?? 0) - Number(invoice.subtotal ?? 0)
        ),
      taxRate:
        Number(invoice.subtotal ?? 0) > 0
          ? (Number(invoice.tax_total ?? 0) / Number(invoice.subtotal ?? 1)) * 100
          : 0,
      grandTotal: Number(invoice.grand_total ?? 0),
      documentContent,
      linkedProformaNumbers: proformas.map((proforma) => proforma.pi_number),
      buyerOrderNo: invoice.po_number,
      buyerOrderDate: invoice.po_date,
      notes,
    })

    const buffer = await renderInvoiceDocx(data)
    const filename = `Tax-Invoice-${safeFilenamePart(
      data.invoiceNumber,
      invoice.id.slice(0, 8)
    )}.docx`

    return {
      ok: true,
      base64: buffer.toString('base64'),
      filename,
      mimeType: DOCX_MIME_TYPE,
    }
  } catch (error) {
    return {
      ok: false,
      error: errorMessage(error, 'Could not generate the tax invoice document.'),
    }
  }
}

/** Render a tax invoice proof as a PDF (Sr No + Description only). */
export async function downloadTaxInvoiceProofDocument(
  invoiceId: string
): Promise<InvoiceDocumentResult> {
  try {
    if (!invoiceId?.trim()) {
      return { ok: false, error: 'Choose a tax invoice to download.' }
    }

    const supabase = await createClient()
    const { data: invoiceData, error: invoiceError } = await supabase
      .from('tax_invoices')
      .select(
        'id, tax_invoice_number, invoice_date, client_id, subtotal, tax_total, grand_total, status_code, po_number, po_date, notes, document_content, created_at'
      )
      .eq('id', invoiceId)
      .single()

    if (invoiceError) {
      throw invoiceError
    }

    const invoice = invoiceData as TaxInvoiceRow

    const [{ data: client, error: clientError }, articlesResult, proformaResult] =
      await Promise.all([
        invoice.client_id
          ? supabase
              .from('clients')
              .select('company_name, location, address, city, state, gstin, email, phone')
              .eq('id', invoice.client_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('article_requests').select('*').eq('tax_invoice_id', invoice.id).order('created_at', { ascending: true }),
        supabase.from('proforma_invoices').select('id, pi_number').eq('tax_invoice_id', invoice.id).order('pi_date', { ascending: true }),
      ])

    if (clientError) throw clientError
    if (articlesResult.error) throw articlesResult.error
    if (proformaResult.error) throw proformaResult.error

    const proformas = (proformaResult.data ?? []) as ProformaLinkRow[]
    let articles = (articlesResult.data ?? []) as ArticleRequestRow[]
    if (articles.length === 0 && proformas.length > 0) {
      const { data: fallbackArticles, error: fallbackError } = await supabase
        .from('article_requests')
        .select('*')
        .in('proforma_invoice_id', proformas.map((p) => p.id))
        .order('created_at', { ascending: true })
      if (fallbackError) throw fallbackError
      articles = (fallbackArticles ?? []) as ArticleRequestRow[]
    }

    const [departmentName, contactName] = await Promise.all([
      fetchDepartmentName(firstValue(articles, 'department_id')),
      fetchContactName(firstValue(articles, 'contact_id')),
    ])

    const { documentContent, notes } = resolveInvoiceDocumentContent(invoice)
    const data = buildInvoiceDocumentData({
      kind: 'TAX',
      invoiceNumber: invoice.tax_invoice_number ?? invoice.id.slice(0, 8).toUpperCase(),
      invoiceDate: invoice.invoice_date,
      createdAt: invoice.created_at,
      client: client as InvoiceClientInfo | null,
      departmentName,
      contactName,
      articles,
      subtotal: Number(invoice.subtotal ?? 0),
      taxAmount: Number(invoice.tax_total ?? 0) || Math.max(0, Number(invoice.grand_total ?? 0) - Number(invoice.subtotal ?? 0)),
      taxRate: Number(invoice.subtotal ?? 0) > 0 ? (Number(invoice.tax_total ?? 0) / Number(invoice.subtotal ?? 1)) * 100 : 0,
      grandTotal: Number(invoice.grand_total ?? 0),
      documentContent,
      linkedProformaNumbers: proformas.map((p) => p.pi_number),
      buyerOrderNo: invoice.po_number,
      buyerOrderDate: invoice.po_date,
      notes,
    })

    const buffer = await renderTaxInvoiceProofPdf(data)
    const filename = `PROOF-${safeFilenamePart(data.invoiceNumber, invoice.id.slice(0, 8))}.pdf`
    return { ok: true, base64: buffer.toString('base64'), filename, mimeType: 'application/pdf' }
  } catch (error) {
    return { ok: false, error: errorMessage(error, 'Could not generate the tax invoice proof document.') }
  }
}
