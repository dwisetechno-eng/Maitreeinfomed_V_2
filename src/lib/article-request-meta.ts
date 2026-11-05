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
  batchId?: string
  batchTag?: string
}

export function encodeArticleRequestNotes(meta: ArticleRequestMeta): string {
  return `${ARTICLE_META_PREFIX}${JSON.stringify({
    title: meta.title,
    rate: meta.rate,
    vendorName: meta.vendorName ?? null,
    remarks: meta.remarks ?? null,
    batchId: meta.batchId ?? null,
    batchTag: meta.batchTag ?? null,
  })}`
}

/**
 * Rewrite the batch fields inside a structured `notes` payload while preserving
 * the rest of the metadata. Plain-text notes are returned untouched because they
 * cannot safely carry structured batch data.
 */
export function withArticleBatchMeta(
  notes: string | null | undefined,
  batchId: string | null,
  batchTag: string | null
): string | null {
  const meta = parseArticleRequestMeta(notes)

  if (!meta) {
    return notes ?? null
  }

  return encodeArticleRequestNotes({
    ...meta,
    batchId: batchId ?? undefined,
    batchTag: batchTag ?? undefined,
  })
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
      batchId?: unknown
      batchTag?: unknown
    }

    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      rate: typeof parsed.rate === 'number' && Number.isFinite(parsed.rate) ? parsed.rate : 0,
      vendorName: typeof parsed.vendorName === 'string' ? parsed.vendorName : undefined,
      remarks: typeof parsed.remarks === 'string' ? parsed.remarks : undefined,
      batchId: typeof parsed.batchId === 'string' ? parsed.batchId : undefined,
      batchTag: typeof parsed.batchTag === 'string' ? parsed.batchTag : undefined,
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
  article_description?: string | null
  rate?: number | null
  cost_price?: number | null
  batch_id?: string | null
  batch_tag?: string | null
}

export function getArticleTitle(row: ArticleRequestRow): string {
  const meta = parseArticleRequestMeta(row.notes)

  if (row.article_title?.trim()) {
    return row.article_title.trim()
  }

  // The base schema stores the description in `article_description`; the
  // proforma migration adds the shorter `article_title` column.
  if (row.article_description?.trim()) {
    return row.article_description.trim()
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

  if (typeof row.cost_price === 'number' && Number.isFinite(row.cost_price)) {
    return row.cost_price
  }

  return parseArticleRequestMeta(row.notes)?.rate ?? 0
}

export function getArticleQuantity(row: ArticleRequestRow): number {
  if (typeof row.quantity === 'number' && Number.isFinite(row.quantity) && row.quantity > 0) {
    return row.quantity
  }

  return 1
}

/** Batch id stored in the native column or the structured notes fallback. */
export function getArticleBatchId(row: ArticleRequestRow): string | null {
  if (row.batch_id?.trim()) {
    return row.batch_id.trim()
  }

  return parseArticleRequestMeta(row.notes)?.batchId ?? null
}

/** Human readable batch tag, if the import provided one. */
export function getArticleBatchTag(row: ArticleRequestRow): string | null {
  if (row.batch_tag?.trim()) {
    return row.batch_tag.trim()
  }

  return parseArticleRequestMeta(row.notes)?.batchTag ?? null
}
