/**
 * Helpers for article request metadata.
 *
 * The base schema only has `notes` for descriptive text. Until the proforma
 * migration adds `article_title` and `rate`, imported rows stash their title,
 * rate and other details in a structured `notes` payload. These helpers let the
 * UI recover that data and keep working with either schema.
 */

export const ARTICLE_META_PREFIX = '@@proforma:'

export type ArticleRequestMeta = {
  title: string
  rate: number
  vendorName?: string
  remarks?: string
}

export function encodeArticleRequestNotes(meta: ArticleRequestMeta): string {
  return `${ARTICLE_META_PREFIX}${JSON.stringify({
    title: meta.title,
    rate: meta.rate,
    vendorName: meta.vendorName ?? null,
    remarks: meta.remarks ?? null,
  })}`
}

export function parseArticleRequestMeta(
  notes: string | null | undefined
): ArticleRequestMeta | null {
  if (!notes || !notes.startsWith(ARTICLE_META_PREFIX)) {
    return null
  }

  try {
    const parsed = JSON.parse(notes.slice(ARTICLE_META_PREFIX.length)) as {
      title?: unknown
      rate?: unknown
      vendorName?: unknown
      remarks?: unknown
    }

    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      rate: typeof parsed.rate === 'number' && Number.isFinite(parsed.rate) ? parsed.rate : 0,
      vendorName: typeof parsed.vendorName === 'string' ? parsed.vendorName : undefined,
      remarks: typeof parsed.remarks === 'string' ? parsed.remarks : undefined,
    }
  } catch {
    return null
  }
}

export type ArticleRequestRow = {
  id: string
  client_id: string | null
  department_id: string | null
  vendor_id: string | null
  quantity: number | null
  status_code: string | null
  proforma_invoice_id: string | null
  tax_invoice_id: string | null
  request_date: string | null
  notes: string | null
  created_at: string | null
  article_title?: string | null
  rate?: number | null
}

export function getArticleTitle(row: ArticleRequestRow): string {
  const meta = parseArticleRequestMeta(row.notes)

  if (row.article_title?.trim()) {
    return row.article_title.trim()
  }

  if (meta?.title.trim()) {
    return meta.title.trim()
  }

  if (row.notes && !meta) {
    return row.notes
  }

  return `Article request ${row.id.slice(0, 8)}`
}

export function getArticleRate(row: ArticleRequestRow): number {
  if (typeof row.rate === 'number' && Number.isFinite(row.rate)) {
    return row.rate
  }

  return parseArticleRequestMeta(row.notes)?.rate ?? 0
}

export function getArticleQuantity(row: ArticleRequestRow): number {
  if (typeof row.quantity === 'number' && Number.isFinite(row.quantity) && row.quantity > 0) {
    return row.quantity
  }

  return 1
}
