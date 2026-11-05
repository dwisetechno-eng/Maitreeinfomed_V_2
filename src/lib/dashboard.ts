export type DashboardArticle = {
  id: string
  client_id: string | null
  department_id: string | null
  status_code: string | null
  request_date: string | null
  created_at: string | null
  proforma_invoice_id: string | null
  tax_invoice_id: string | null
}

export type InvoiceRow = {
  id: string
  subtotal: number | null
  grand_total: number | null
}

export type StatusMasterRow = {
  status_code: string
  status_label: string
  display_order: number | null
  description: string | null
}

export type NamedOption = {
  id: string
  name: string
}

export function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

export function invoiceValue(invoice: InvoiceRow): number {
  return invoice.grand_total != null ? toNumber(invoice.grand_total) : toNumber(invoice.subtotal)
}

export function formatCurrency(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(typeof value === 'number' && Number.isFinite(value) ? value : 0)
}

export function parseDateValue(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function startOfMonthUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}
