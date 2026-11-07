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
      batchId: string
      batchTag: string | null
      clientId: string
      departmentId: string | null
      contactId: string | null
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

/** Columns that are stripped one at a time when a database has not migrated yet. */
const OPTIONAL_IMPORT_COLUMNS = [
  'article_title',
  'rate',
  'batch_id',
  'batch_tag',
  'contact_id',
  'department_id',
] as const

const MAX_IMPORT_ROWS = 2000
const MAX_FILE_BYTES = 8 * 1024 * 1024

/**
 * Import an Excel workbook as one article-request batch for a client.
 *
 * Every row shares a freshly generated `batch_id`, so the proforma dialog can
 * offer "select entire unbilled batch" without any extra bookkeeping.
 */
export async function importArticleBatch(formData: FormData): Promise<ImportResult> {
  const file = formData.get('file')
  const clientId = String(formData.get('clientId') ?? '').trim()
  const departmentId = String(formData.get('departmentId') ?? '').trim()
  const contactId = String(formData.get('contactId') ?? '').trim()
  const batchTag = String(formData.get('batchTag') ?? '').trim()

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
    console.error('Unable to parse article request import workbook', error)
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

  const batchId = crypto.randomUUID()
  const normalizedBatchTag = batchTag || null

  const meta: ArticleRequestMeta[] = rows.map((row) => ({
    title: row.title,
    rate: row.rate,
    vendorName: row.vendorName ?? undefined,
    remarks: row.remarks ?? undefined,
    batchId,
    batchTag: normalizedBatchTag ?? undefined,
  }))

  const insertRows = rows.map((row, index) => {
    const payload: Record<string, unknown> = {
      client_id: clientId,
      department_id: departmentId || null,
      contact_id: contactId || null,
      vendor_id: row.vendorName ? vendorIds.get(normalizeKey(row.vendorName)) ?? null : null,
      article_description: row.title,
      article_title: row.title,
      cost_price: row.rate,
      rate: row.rate,
      quantity: row.quantity,
      request_date: row.requestDate ?? today(),
      notes: encodeArticleRequestNotes(meta[index]),
      batch_id: batchId,
      batch_tag: normalizedBatchTag,
    }

    if (initialStatusCode) {
      payload.status_code = initialStatusCode
    }

    return payload
  })

  try {
    const inserted = await insertWithColumnFallback(supabase, insertRows)

    if (inserted.error) {
      await removeVendors(supabase, createdVendorIds)
      return {
        ok: false,
        error: describeError(inserted.error, 'Unable to import the article requests.'),
      }
    }

    if (inserted.rows.length !== rows.length) {
      await removeVendors(supabase, createdVendorIds)
      return {
        ok: false,
        error:
          'The import was only partially saved. Please refresh and check the article requests.',
      }
    }

    return {
      ok: true,
      imported: rows.map((row, index) => ({
        id: inserted.rows[index].id,
        title: row.title,
        rate: row.rate,
        quantity: row.quantity,
        vendorName: row.vendorName,
      })),
      vendorsCreated,
      skipped,
      usedFallbackColumns: inserted.usedFallbackColumns,
      batchId,
      batchTag: normalizedBatchTag,
      clientId,
      departmentId: departmentId || null,
      contactId: contactId || null,
    }
  } catch (error) {
    await removeVendors(supabase, createdVendorIds)
    return { ok: false, error: describeError(error, 'Unable to import the article requests.') }
  }
}

/**
 * Insert all rows, stripping optional columns from every row when the target
 * database has not run the latest migration. This keeps the import working
 * while still storing batch metadata inside `notes`.
 */
async function insertWithColumnFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  baseRows: Record<string, unknown>[]
): Promise<{
  rows: { id: string }[]
  error: unknown
  usedFallbackColumns: boolean
}> {
  const rows = baseRows.map((row) => ({ ...row }))
  let usedFallbackColumns = false

  for (let attempt = 0; attempt < OPTIONAL_IMPORT_COLUMNS.length + 2; attempt += 1) {
    const { data, error } = await supabase
      .from('article_requests')
      .insert(rows)
      .select('id')

    if (!error) {
      return {
        rows: (data ?? []) as { id: string }[],
        error: null,
        usedFallbackColumns,
      }
    }

    if (!isMissingColumnError(error)) {
      return { rows: [], error, usedFallbackColumns }
    }

    const missing = extractMissingColumn(error)

    if (missing && isOptionalImportColumn(missing)) {
      for (const row of rows) {
        delete row[missing]
      }
      usedFallbackColumns = true
      continue
    }

    const fallback = OPTIONAL_IMPORT_COLUMNS.find((column) =>
      rows.some((row) => column in row)
    )

    if (!fallback) {
      return { rows: [], error, usedFallbackColumns }
    }

    for (const row of rows) {
      delete row[fallback]
    }
    usedFallbackColumns = true
  }

  return {
    rows: [],
    error: new Error('The article requests could not be saved after removing unsupported columns.'),
    usedFallbackColumns,
  }
}

function isOptionalImportColumn(column: string): boolean {
  return (OPTIONAL_IMPORT_COLUMNS as readonly string[]).includes(column)
}

function extractMissingColumn(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const message = (error as { message?: string }).message ?? ''
  const postgresMatch = /column\s+[^\s.]+\.([a-zA-Z0-9_]+)\s+does not exist/i.exec(message)

  if (postgresMatch) {
    return postgresMatch[1]
  }

  const cacheMatch = /could not find the '([^']+)' column/i.exec(message)

  return cacheMatch?.[1] ?? null
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

/**
 * Build a sample .xlsx that documents the expected import columns and can be
 * downloaded from the import dialog.
 */
export async function downloadImportTemplate(): Promise<
  { ok: true; base64: string; filename: string } | { ok: false; error: string }
> {
  try {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Article Requests')
    const sampleDate = today()

    sheet.columns = [
      { header: 'Article', key: 'article', width: 42 },
      { header: 'Vendor', key: 'vendor', width: 20 },
      { header: 'Quantity', key: 'quantity', width: 12 },
      { header: 'Rate', key: 'rate', width: 12 },
      { header: 'Request date', key: 'requestDate', width: 14 },
      { header: 'Remarks', key: 'remarks', width: 36 },
    ]

    sheet.addRow({
      article: 'Sample scientific article title',
      vendor: 'ABC Ltd',
      quantity: 1,
      rate: 1200,
      requestDate: sampleDate,
      remarks: 'Sample remarks',
    })
    sheet.addRow({
      article: 'Another article title',
      vendor: 'InfoSolutions',
      quantity: 2,
      rate: 850,
      requestDate: sampleDate,
      remarks: 'Optional notes',
    })

    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    }
    headerRow.alignment = { vertical: 'middle' }

    // Keep the column rules next to the sample so the dialog does not need a
    // long explanation. Delete this sheet before uploading if you prefer; only
    // the first worksheet is read.
    const instructions = workbook.addWorksheet('Instructions')
    instructions.columns = [
      { header: 'Column', key: 'column', width: 18 },
      { header: 'Required', key: 'required', width: 12 },
      { header: 'Also accepted as', key: 'aliases', width: 44 },
      { header: 'Notes', key: 'notes', width: 52 },
    ]

    instructions.addRows([
      {
        column: 'Article',
        required: 'Yes',
        aliases: 'Title, Article title, Description',
        notes: 'The article or paper title. Rows without this are skipped.',
      },
      {
        column: 'Vendor',
        required: 'No',
        aliases: 'Supplier, Publisher',
        notes: 'Unknown vendor names are created automatically.',
      },
      {
        column: 'Quantity',
        required: 'No',
        aliases: 'Qty, Units, Copies',
        notes: 'Defaults to 1 when blank.',
      },
      {
        column: 'Rate',
        required: 'No',
        aliases: 'Price, Unit price, Cost, Amount',
        notes: 'Unit cost in INR. Defaults to 0 when blank.',
      },
      {
        column: 'Request date',
        required: 'No',
        aliases: 'Date, Requested on, Requested date',
        notes: 'Any date Excel recognises. Defaults to today when blank.',
      },
      {
        column: 'Remarks',
        required: 'No',
        aliases: 'Notes, Note, Comment, Instructions',
        notes: 'Free text stored with the request.',
      },
    ])

    const instructionHeader = instructions.getRow(1)
    instructionHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    instructionHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    }
    instructionHeader.alignment = { vertical: 'middle' }
    instructions.getColumn('required').alignment = { horizontal: 'center' }

    const buffer = await workbook.xlsx.writeBuffer()
    const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64')

    return {
      ok: true,
      base64,
      filename: 'article-requests-import-template.xlsx',
    }
  } catch (error) {
    console.error('Unable to build the import template workbook', error)
    return { ok: false, error: 'Could not build the sample file.' }
  }
}

/**
 * Export the given article requests as an .xlsx workbook, including the
 * related client, department, vendor, status and invoice numbers.
 */
export async function exportArticles(
  articleIds: string[]
): Promise<{ ok: true; base64: string; filename: string } | { ok: false; error: string }> {
  if (!Array.isArray(articleIds) || articleIds.length === 0) {
    return { ok: false, error: 'There is nothing to export.' }
  }

  try {
    const supabase = await createClient()

    const { data: articles, error: articlesError } = await supabase
      .from('article_requests')
      .select('*')
      .in('id', articleIds)
      .order('request_date', { ascending: false, nullsFirst: false })

    if (articlesError) {
      return { ok: false, error: articlesError.message }
    }

    const rows = (articles ?? []) as Array<Record<string, unknown>>

    if (rows.length === 0) {
      return { ok: false, error: 'There is nothing to export.' }
    }

    const clientIds = Array.from(
      new Set(rows.map((row) => row.client_id).filter(Boolean) as string[])
    )
    const departmentIds = Array.from(
      new Set(rows.map((row) => row.department_id).filter(Boolean) as string[])
    )
    const vendorIds = Array.from(
      new Set(rows.map((row) => row.vendor_id).filter(Boolean) as string[])
    )
    const proformaIds = Array.from(
      new Set(rows.map((row) => row.proforma_invoice_id).filter(Boolean) as string[])
    )
    const taxIds = Array.from(
      new Set(rows.map((row) => row.tax_invoice_id).filter(Boolean) as string[])
    )
    const contactIds = Array.from(
      new Set(rows.map((row) => row.contact_id).filter(Boolean) as string[])
    )

    const [
      clientsResult,
      departmentsResult,
      vendorsResult,
      proformasResult,
      taxResult,
      contactsResult,
    ] = await Promise.all([
        clientIds.length
          ? supabase.from('clients').select('id, company_name').in('id', clientIds)
          : Promise.resolve({ data: [], error: null }),
        departmentIds.length
          ? supabase.from('departments').select('id, department_name').in('id', departmentIds)
          : Promise.resolve({ data: [], error: null }),
        vendorIds.length
          ? supabase.from('vendors').select('id, vendor_name').in('id', vendorIds)
          : Promise.resolve({ data: [], error: null }),
        proformaIds.length
          ? supabase.from('proforma_invoices').select('id, pi_number, status_code').in('id', proformaIds)
          : Promise.resolve({ data: [], error: null }),
        taxIds.length
          ? supabase.from('tax_invoices').select('id, tax_invoice_number, status_code').in('id', taxIds)
          : Promise.resolve({ data: [], error: null }),
        contactIds.length
          ? supabase.from('client_contacts').select('id, contact_name').in('id', contactIds)
          : Promise.resolve({ data: [], error: null }),
      ])

    const clientNames = new Map(
      ((clientsResult.data ?? []) as Array<{ id: string; company_name: string }>).map((row) => [
        row.id,
        row.company_name,
      ])
    )
    const departmentNames = new Map(
      ((departmentsResult.data ?? []) as Array<{ id: string; department_name: string }>).map((row) => [
        row.id,
        row.department_name,
      ])
    )
    const vendorNames = new Map(
      ((vendorsResult.data ?? []) as Array<{ id: string; vendor_name: string }>).map((row) => [
        row.id,
        row.vendor_name,
      ])
    )
    const proformaMap = new Map(
      ((proformasResult.data ?? []) as Array<{ id: string; pi_number: string | null; status_code: string | null }>).map(
        (row) => [row.id, row]
      )
    )
    const taxMap = new Map(
      ((taxResult.data ?? []) as Array<{ id: string; tax_invoice_number: string | null; status_code: string | null }>).map(
        (row) => [row.id, row]
      )
    )
    const contactNames = new Map(
      ((contactsResult.data ?? []) as Array<{ id: string; contact_name: string }>).map((row) => [
        row.id,
        row.contact_name,
      ])
    )

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Article Requests')

    sheet.columns = [
      { header: 'Article', key: 'article', width: 40 },
      { header: 'Client', key: 'client', width: 22 },
      { header: 'Department', key: 'department', width: 22 },
      { header: 'Vendor', key: 'vendor', width: 20 },
      { header: 'Contact', key: 'contact', width: 20 },
      { header: 'Batch', key: 'batch', width: 18 },
      { header: 'Cost', key: 'cost', width: 12 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Total cost', key: 'totalCost', width: 14 },
      { header: 'Urgency', key: 'urgency', width: 12 },
      { header: 'Status', key: 'status', width: 20 },
      { header: 'Request date', key: 'requestDate', width: 14 },
      { header: 'Proforma', key: 'proforma', width: 18 },
      { header: 'Tax invoice', key: 'taxInvoice', width: 18 },
      { header: 'Created', key: 'created', width: 20 },
    ]

    for (const row of rows) {
      const proforma = row.proforma_invoice_id
        ? proformaMap.get(String(row.proforma_invoice_id))
        : undefined
      const taxInvoice = row.tax_invoice_id
        ? taxMap.get(String(row.tax_invoice_id))
        : undefined

      const status =
        row.tax_invoice_id
          ? (String(taxInvoice?.status_code ?? '').toUpperCase() === 'PAID'
              ? 'COMPLETED'
              : 'PI_GENERATED')
          : row.proforma_invoice_id
            ? 'PI_GENERATED'
            : String(row.status_code ?? '')

      sheet.addRow({
        article: String(row.article_description ?? row.article_title ?? '').trim() || 'Untitled article',
        client: row.client_id ? clientNames.get(String(row.client_id)) ?? '' : '',
        department: row.department_id ? departmentNames.get(String(row.department_id)) ?? '' : '',
        vendor: row.vendor_id ? vendorNames.get(String(row.vendor_id)) ?? '' : '',
        contact: row.contact_id ? contactNames.get(String(row.contact_id)) ?? '' : '',
        batch: String(row.batch_tag ?? row.batch_id ?? '').trim(),
        cost: Number(row.cost_price ?? 0),
        qty: Number(row.quantity ?? 1),
        totalCost: Number(row.total_cost ?? 0),
        urgency: String(row.urgency ?? ''),
        status,
        requestDate: String(row.request_date ?? '').slice(0, 10),
        proforma: proforma?.pi_number ?? (row.proforma_invoice_id ? String(row.proforma_invoice_id).slice(0, 8).toUpperCase() : ''),
        taxInvoice: taxInvoice?.tax_invoice_number ?? (row.tax_invoice_id ? String(row.tax_invoice_id).slice(0, 8).toUpperCase() : ''),
        created: String(row.created_at ?? '').slice(0, 19).replace('T', ' '),
      })
    }

    const headerRow = sheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    }
    headerRow.alignment = { vertical: 'middle' }

    const buffer = await workbook.xlsx.writeBuffer()
    const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64')

    const stamp = new Date().toISOString().slice(0, 10)
    return {
      ok: true,
      base64,
      filename: `article-requests-${stamp}.xlsx`,
    }
  } catch (error) {
    console.error('Unable to export article requests', error)
    return { ok: false, error: 'Could not build the export file.' }
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
