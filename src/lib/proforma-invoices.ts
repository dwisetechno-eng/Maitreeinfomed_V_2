/**
 * Shared proforma invoice helpers.
 *
 * `proforma_invoices.pi_number` is NOT NULL and must always be present, so every
 * creation path goes through this module instead of building ad-hoc inserts.
 * The helper also tolerates databases where the optional `pi_date`,
 * `department_id`, `contact_id` or tax columns have not been migrated yet.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { isMissingColumnError } from '@/lib/supabase-errors'

export const DEFAULT_TAX_RATE = 18
export const PI_NUMBER_PREFIX = 'PI'

/** Columns that may be absent before the latest migration; dropped one at a time. */
const OPTIONAL_COLUMNS = [
  'department_id',
  'contact_id',
  'notes',
  'pi_date',
  'tax_rate',
  'tax_amount',
  'status_code',
] as const

export type CreateProformaInvoiceInput = {
  clientId: string
  departmentId?: string | null
  contactId?: string | null
  subtotal: number
  grandTotal: number
  taxRate?: number
  taxAmount?: number
  statusCode?: string | null
  invoiceDate?: string
  piDate?: string
  notes?: string | null
}

export type CreateProformaInvoiceResult =
  | {
      ok: true
      id: string
      piNumber: string
      piDate: string
      invoiceDate: string
      usedFallbackColumns: boolean
    }
  | { ok: false; error: unknown }

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** `PI-YYYYMM-` prefix for the supplied ISO date (defaults to today). */
export function getPiNumberPrefix(date: string = todayIsoDate()): string {
  return `${PI_NUMBER_PREFIX}-${date.slice(0, 7).replace('-', '')}-`
}

/**
 * Increment the latest number for the same month. The suffix is zero padded to
 * at least four digits, so `PI-202611-0009` becomes `PI-202611-0010`.
 */
export function nextPiNumber(
  latestNumber: string | null | undefined,
  date: string = todayIsoDate()
): string {
  const prefix = getPiNumberPrefix(date)

  if (!latestNumber || !latestNumber.startsWith(prefix)) {
    return `${prefix}0001`
  }

  const suffix = latestNumber.slice(prefix.length)
  const match = /^(\d+)$/.exec(suffix)

  if (!match) {
    return `${prefix}0001`
  }

  const width = Math.max(4, match[1].length)
  const next = String(Number(match[1]) + 1).padStart(width, '0')

  return `${prefix}${next}`
}

/** Look up the highest existing number for the month and return the next one. */
export async function fetchNextPiNumber(
  supabase: SupabaseClient,
  date: string = todayIsoDate()
): Promise<string> {
  const prefix = getPiNumberPrefix(date)

  const { data, error } = await supabase
    .from('proforma_invoices')
    .select('pi_number')
    .like('pi_number', `${prefix}%`)
    .order('pi_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // A read failure should not block creation; the unique retry loop and the
    // database constraint will surface a real problem if one exists.
    return nextPiNumber(null, date)
  }

  return nextPiNumber((data as { pi_number?: string | null } | null)?.pi_number, date)
}

/**
 * Insert a proforma invoice with a generated `pi_number` and `pi_date`.
 *
 * - `pi_date` is sent explicitly and falls back to `invoice_date` when the
 *   column has not been migrated on the target database.
 * - Missing optional columns are stripped automatically (one per attempt).
 * - A `23505` unique conflict regenerates the number and retries.
 */
export async function createProformaInvoice(
  supabase: SupabaseClient,
  input: CreateProformaInvoiceInput
): Promise<CreateProformaInvoiceResult> {
  const invoiceDate = input.invoiceDate ?? todayIsoDate()
  const piDate = input.piDate ?? invoiceDate
  const taxRate =
    typeof input.taxRate === 'number' && Number.isFinite(input.taxRate)
      ? input.taxRate
      : DEFAULT_TAX_RATE
  const taxAmount =
    typeof input.taxAmount === 'number' && Number.isFinite(input.taxAmount)
      ? input.taxAmount
      : (input.subtotal * taxRate) / 100

  let lastError: unknown = null

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const piNumber = await fetchNextPiNumber(supabase, piDate)

    const payload: Record<string, unknown> = {
      pi_number: piNumber,
      pi_date: piDate,
      invoice_date: invoiceDate,
      client_id: input.clientId,
      subtotal: roundMoney(input.subtotal),
      tax_rate: taxRate,
      tax_amount: roundMoney(taxAmount),
      grand_total: roundMoney(input.grandTotal),
    }

    if (input.departmentId) {
      payload.department_id = input.departmentId
    }

    if (input.contactId) {
      payload.contact_id = input.contactId
    }

    if (input.statusCode) {
      payload.status_code = input.statusCode
    }

    if (input.notes) {
      payload.notes = input.notes
    }

    const result = await insertWithColumnFallback(supabase, payload)

    if (!result.error && result.data?.id) {
      return {
        ok: true,
        id: result.data.id,
        piNumber,
        piDate,
        invoiceDate,
        usedFallbackColumns: result.usedFallbackColumns,
      }
    }

    lastError = result.error ?? new Error('The proforma invoice could not be created.')

    if (isUniqueViolation(result.error)) {
      // Another request used the same number; loop regenerates from the latest.
      continue
    }

    return { ok: false, error: lastError }
  }

  return {
    ok: false,
    error: lastError ?? new Error('The proforma invoice number could not be generated.'),
  }
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const { code, message } = error as { code?: string; message?: string }

  return code === '23505' || /duplicate key|unique constraint/i.test(message ?? '')
}

export function extractMissingColumn(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const { message } = error as { message?: string }
  const text = message ?? ''

  // 42703: column proforma_invoices.pi_date does not exist
  const postgresMatch = /column\s+[^\s.]+\.([a-zA-Z0-9_]+)\s+does not exist/i.exec(text)

  if (postgresMatch) {
    return postgresMatch[1]
  }

  // PGRST204: Could not find the 'pi_date' column of 'proforma_invoices'...
  const cacheMatch = /could not find the '([^']+)' column/i.exec(text)

  return cacheMatch?.[1] ?? null
}

async function insertWithColumnFallback(
  supabase: SupabaseClient,
  basePayload: Record<string, unknown>
): Promise<{
  data: { id: string } | null
  error: unknown
  usedFallbackColumns: boolean
}> {
  const payload = { ...basePayload }
  let usedFallbackColumns = false

  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length + 4; attempt += 1) {
    const { data, error } = await supabase
      .from('proforma_invoices')
      .insert(payload)
      .select('id')
      .single()

    if (!error) {
      return { data: (data as { id: string } | null) ?? null, error: null, usedFallbackColumns }
    }

    if (!isMissingColumnError(error) && !extractMissingColumn(error)) {
      return { data: null, error, usedFallbackColumns }
    }

    const missing = extractMissingColumn(error)

    if (missing && missing in payload && isOptionalColumn(missing)) {
      delete payload[missing]
      usedFallbackColumns = true
      continue
    }

    // Could not identify the column: shed known optional columns in a stable order.
    const fallback = OPTIONAL_COLUMNS.find((column) => column in payload)

    if (!fallback) {
      return { data: null, error, usedFallbackColumns }
    }

    delete payload[fallback]
    usedFallbackColumns = true
  }

  return {
    data: null,
    error: new Error('The proforma invoice could not be saved after removing unsupported columns.'),
    usedFallbackColumns,
  }
}

function isOptionalColumn(column: string): boolean {
  return column === 'pi_date' || (OPTIONAL_COLUMNS as readonly string[]).includes(column)
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}
