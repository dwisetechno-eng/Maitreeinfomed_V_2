'use server'

import ExcelJS from 'exceljs'

import {
  encodeArticleRequestNotes,
  type ArticleRequestMeta,
} from '@/lib/article-request-meta'
import { isMissingColumnError } from '@/lib/supabase-errors'
import { createClient } from '@/utils/supabase/server'

export type ImportedArticle = {
  id: string
  title: string
  rate: number
  quantity: number
  vendorName: string | null
}

export type ImportSkip = {
  row: number
  reason: string
}

export type ImportResult =
  | {
      ok: true
      imported: ImportedArticle[]
      vendorsCreated: string[]
      skipped: ImportSkip[]
      usedFallbackColumns: boolean
    }
  | {
      ok: false
      error: string
    }

type Field = 'title' | 'vendor' | 'quantity' | 'rate' | 'date' | 'notes' | 'doi'

type ColumnMap = Partial<Record<Field, number>>

type ParsedRow = {
  rowNumber: number
  title: string
  vendorName: string | null
  quantity: number
  rate: number
  requestDate: string | null
  remarks: string | null
}

const HEADER_ALIASES: Record<Field, string[]> = {
  title: [
    'article',
    'articletitle',
    'title',
    'articlename',
    'particulars',
    'articleparticulars',
    'description',
    'details',
    'journalarticle',
    'name',
  ],
  vendor: [
    'vendor',
    'vendorname',
    'supplier',
    'suppliername',
    'publisher',
    'publishername',
    'source',
  ],
  quantity: ['quantity', 'qty', 'units', 'copies', 'nos', 'no', 'count'],
  rate: [
    'rate',
    'unitrate',
    'price',
    'unitprice',
    'amount',
    'cost',
    'unitcost',
    'fee',
    'fees',
    'charges',
    'value',
  ],
  date: ['requestdate', 'date', 'requestedon', 'requesteddate', 'requestdt'],
  notes: ['notes', 'note', 'remarks', 'remark', 'comment', 'comments', 'instructions'],
  doi: ['doi', 'digitalobjectidentifier'],
}

const MAX_IMPORT_ROWS = 2000
const MAX_FILE_BYTES = 8 * 1024 * 1024

export async function importArticlesToProforma(formData: FormData): Promise<ImportResult> {
  const file = formData.get('file')
  const clientId = String(formData.get('clientId') ?? '').trim()
  const departmentId = String(formData.get('departmentId') ?? '').trim()

  if (!(file instanceof File)) {
    return { ok: false, error: 'Attach an .xlsx file to import.' }
  }

  if (!clientId) {
    return { ok: false, error: 'Select a client before importing articles.' }
  }

  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    return { ok: false, error: 'Only .xlsx or .xlsm files are supported.' }
  }

  if (file.size === 0) {
    return { ok: false, error: 'The selected file is empty.' }
  }

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'The file is larger than 8 MB. Split it into smaller imports.' }
  }

  let rows: ParsedRow[]
  let skipped: ImportSkip[] = []

  try {
    const workbook = new ExcelJS.Workbook()
    const buffer = Buffer.from(await file.arrayBuffer())
    // exceljs ships its own Buffer typing which can lag the project's Node types.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])

    const sheet = workbook.worksheets[0]

    if (!sheet) {
      return { ok: false, error: 'The workbook does not contain any worksheets.' }
    }

    const header = resolveHeaderRow(sheet)

    if (!header) {
      return {
        ok: false,
        error:
          'Could not find a header row. Include columns such as “Article”, “Vendor”, “Quantity” and “Rate”.',
      }
    }

    if (sheet.rowCount - header.rowNumber > MAX_IMPORT_ROWS) {
      return {
        ok: false,
        error: `This file has more than ${MAX_IMPORT_ROWS.toLocaleString()} rows. Split it into smaller imports.`,
      }
    }

    const parsed = parseRows(sheet, header)
    rows = parsed.rows
    skipped = parsed.skipped
  } catch (error) {
    console.error('Unable to parse proforma import workbook', error)
    return {
      ok: false,
      error: 'The workbook could not be read. Make sure it is a valid, unprotected .xlsx file.',
    }
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error: 'No usable rows were found. Each row needs at least an article title.',
    }
  }

  const supabase = await createClient()

  // Resolve vendor names to ids, creating any that do not exist yet.
  const vendorNames = Array.from(
    new Set(
      rows
        .map((row) => row.vendorName)
        .filter((name): name is string => Boolean(name && name.trim()))
        .map((name) => name.trim())
    )
  )

  const vendorIds = new Map<string, string>()
  const vendorsCreated: string[] = []
  const createdVendorIds: string[] = []

  try {
    const { data: existingVendors, error: vendorError } = await supabase
      .from('vendors')
      .select('id, vendor_name')

    if (vendorError) {
      return { ok: false, error: describeError(vendorError, 'Unable to load vendors.') }
    }

    for (const vendor of (existingVendors ?? []) as { id: string; vendor_name: string | null }[]) {
      if (vendor.vendor_name) {
        vendorIds.set(normalizeKey(vendor.vendor_name), vendor.id)
      }
    }

    const missing = vendorNames.filter((name) => !vendorIds.has(normalizeKey(name)))

    if (missing.length > 0) {
      const { data: insertedVendors, error: insertVendorError } = await supabase
        .from('vendors')
        .insert(missing.map((vendor_name) => ({ vendor_name })))
        .select('id, vendor_name')

      if (insertVendorError) {
        return {
          ok: false,
          error: describeError(insertVendorError, 'Unable to create the missing vendors.'),
        }
      }

      for (const vendor of (insertedVendors ?? []) as {
        id: string
        vendor_name: string | null
      }[]) {
        if (vendor.vendor_name) {
          vendorIds.set(normalizeKey(vendor.vendor_name), vendor.id)
          vendorsCreated.push(vendor.vendor_name)
          createdVendorIds.push(vendor.id)
        }
      }
    }
  } catch (error) {
    return { ok: false, error: describeError(error, 'Unable to prepare vendors for the import.') }
  }

  // Use an existing article status when one is configured. Otherwise let the
  // column default apply so imports are not blocked by an empty master.
  let initialStatusCode: string | null = null

  try {
    const { data: status } = await supabase
      .from('article_status_master')
      .select('status_code')
      .order('display_order', { ascending: true })
      .order('status_code', { ascending: true })
      .limit(1)
      .maybeSingle()

    initialStatusCode = status?.status_code ?? null
  } catch {
    initialStatusCode = null
  }

  const meta: ArticleRequestMeta[] = rows.map((row) => ({
    title: row.title,
    rate: row.rate,
    vendorName: row.vendorName ?? undefined,
    remarks: row.remarks ?? undefined,
  }))

  const baseRows = rows.map((row) => {
    const payload: Record<string, unknown> = {
      client_id: clientId,
      department_id: departmentId || null,
      vendor_id: row.vendorName ? vendorIds.get(normalizeKey(row.vendorName)) ?? null : null,
      quantity: row.quantity,
      request_date: row.requestDate ?? today(),
    }

    if (initialStatusCode) {
      payload.status_code = initialStatusCode
    }

    return payload
  })

  const richRows = baseRows.map((payload, index) => ({
    ...payload,
    article_title: rows[index].title,
    rate: rows[index].rate,
    notes: rows[index].remarks,
  }))

  const fallbackRows = baseRows.map((payload, index) => ({
    ...payload,
    notes: encodeArticleRequestNotes(meta[index]),
  }))

  try {
    let usedFallbackColumns = false
    let inserted = await supabase
      .from('article_requests')
      .insert(richRows)
      .select('id, notes, quantity')

    if (inserted.error && isMissingColumnError(inserted.error)) {
      usedFallbackColumns = true
      inserted = await supabase
        .from('article_requests')
        .insert(fallbackRows)
        .select('id, notes, quantity')
    }

    if (inserted.error) {
      await removeVendors(supabase, createdVendorIds)
      return {
        ok: false,
        error: describeError(inserted.error, 'Unable to import the article requests.'),
      }
    }

    const insertedRows = (inserted.data ?? []) as { id: string }[]

    if (insertedRows.length !== rows.length) {
      await removeVendors(supabase, createdVendorIds)
      return {
        ok: false,
        error: 'The import was only partially saved. Please refresh and check the pending requests.',
      }
    }

    return {
      ok: true,
      imported: rows.map((row, index) => ({
        id: insertedRows[index].id,
        title: row.title,
        rate: row.rate,
        quantity: row.quantity,
        vendorName: row.vendorName,
      })),
      vendorsCreated,
      skipped,
      usedFallbackColumns,
    }
  } catch (error) {
    await removeVendors(supabase, createdVendorIds)
    return { ok: false, error: describeError(error, 'Unable to import the article requests.') }
  }
}

function resolveHeaderRow(sheet: ExcelJS.Worksheet): { rowNumber: number; columns: ColumnMap } | null {
  const lastRowToScan = Math.min(sheet.rowCount || 0, 12)

  for (let rowNumber = 1; rowNumber <= lastRowToScan; rowNumber += 1) {
    const columns: ColumnMap = {}
    const row = sheet.getRow(rowNumber)

    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const header = normalizeKey(valueToText(cell.value))

      if (!header) {
        return
      }

      for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
        if (columns[field] != null) {
          continue
        }

        if (HEADER_ALIASES[field].includes(header)) {
          columns[field] = columnNumber
          break
        }
      }
    })

    const matchCount = Object.keys(columns).length

    if (columns.title != null || matchCount >= 2) {
      return { rowNumber, columns }
    }
  }

  return null
}

function parseRows(
  sheet: ExcelJS.Worksheet,
  header: { rowNumber: number; columns: ColumnMap }
): { rows: ParsedRow[]; skipped: ImportSkip[] } {
  const rows: ParsedRow[] = []
  const skipped: ImportSkip[] = []

  for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)

    const titleCell = readColumn(row, header.columns.title)
    const notesCell = readColumn(row, header.columns.notes)
    const vendorCell = readColumn(row, header.columns.vendor)
    const doiCell = readColumn(row, header.columns.doi)

    const title = titleCell || notesCell
    const vendorName = vendorCell ? vendorCell.replace(/\s+/g, ' ').trim() : null
    const quantityValue = parseNumber(readColumn(row, header.columns.quantity))
    const rateValue = parseNumber(readColumn(row, header.columns.rate))

    if (!title && !vendorName && rateValue == null) {
      continue
    }

    if (!title) {
      skipped.push({ row: rowNumber, reason: 'Missing article title' })
      continue
    }

    const remarks = [titleCell ? notesCell : '', doiCell ? `DOI: ${doiCell}` : '']
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' · ')

    rows.push({
      rowNumber,
      title,
      vendorName: vendorName || null,
      quantity: quantityValue && quantityValue > 0 ? Math.trunc(quantityValue) : 1,
      rate: rateValue != null && rateValue >= 0 ? roundMoney(rateValue) : 0,
      requestDate: parseDate(readColumn(row, header.columns.date)),
      remarks: remarks || null,
    })
  }

  return { rows, skipped }
}

function readColumn(row: ExcelJS.Row, column: number | undefined): string {
  if (!column) {
    return ''
  }

  return valueToText(row.getCell(column).value)
}

function valueToText(value: ExcelJS.CellValue): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'object') {
    const record = value as {
      richText?: { text?: string }[]
      text?: string
      result?: ExcelJS.CellValue
      hyperlink?: string
    }

    if (Array.isArray(record.richText)) {
      return record.richText.map((part) => part.text ?? '').join('').trim()
    }

    if (typeof record.text === 'string') {
      return record.text.trim()
    }

    if (record.result != null) {
      return valueToText(record.result)
    }

    if (typeof record.hyperlink === 'string') {
      return record.hyperlink
    }
  }

  return String(value).trim()
}

function parseNumber(value: string): number | null {
  if (!value) {
    return null
  }

  const cleaned = value.replace(/[^0-9.-]/g, '')

  if (!cleaned || cleaned === '-' || cleaned === '.') {
    return null
  }

  const parsed = Number(cleaned)

  return Number.isFinite(parsed) ? parsed : null
}

function parseDate(value: string): string | null {
  if (!value) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

async function removeVendors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
) {
  if (ids.length === 0) {
    return
  }

  try {
    await supabase.from('vendors').delete().in('id', ids)
  } catch {
    // Best-effort cleanup; the import error is more useful to the user.
  }
}

function describeError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback
  }

  const { code, message } = error as { code?: string; message?: string }

  switch (code) {
    case '42501':
      return 'Supabase blocked this write. Apply supabase/migrations/20261104170000_proforma_invoicing.sql so the app can create article requests.'
    case '23503':
      return 'A referenced record no longer exists. Refresh the page and pick the client, department and vendor again.'
    case '23502':
      return 'The article_requests table requires a value that was not supplied. Add at least one article status under Masters → Article Status, then retry.'
    case '42P01':
      return 'The article_requests table does not exist. Run the database migrations first.'
    default:
      return message?.trim() || fallback
  }
}
