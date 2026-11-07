/**
 * Shared document model for printable invoices.
 *
 * Both the Word proforma invoice and the PDF tax invoice are generated from
 * this model, so the two documents always show the same numbers. Seller/buyer
 * details that the app does not store yet are defined once here (taken from the
 * supplied templates); anything present in the database overrides them.
 */

import {
  getArticleQuantity,
  getArticleRate,
  getArticleTitle,
  type ArticleRequestRow,
} from '@/lib/article-request-meta'
import { roundMoney } from '@/lib/proforma-invoices'

export type InvoiceKind = 'PROFORMA' | 'TAX'

export type SellerProfile = {
  name: string
  addressLines: string[]
  email: string
  msme: string
  phone: string
  gstin: string
  stateName: string
  stateCode: string
}

export type BuyerProfile = {
  name: string
  addressLines: string[]
  gstin: string
  stateName: string
  stateCode: string
}

export type InvoiceClientInfo = {
  company_name: string | null
  location: string | null
  gstin: string | null
  email: string | null
  phone: string | null
}

export type InvoiceDocumentLine = {
  serial: number
  description: string
  sac: string
  quantity: number
  rate: number
  unit: string
  amount: number
}

export type InvoiceDocumentData = {
  kind: InvoiceKind
  title: string
  invoiceLabel: string
  invoiceNumber: string
  invoiceDateLabel: string
  buyerOrderNo: string
  buyerOrderDateLabel: string
  modeOfPayment: string
  kindAttention: string[]
  purchaseOf: string
  purchaseArticlesOf: string
  purchaseArticlesLine: string
  deliveryDateLabel: string
  serviceCode: string
  serviceDescription: string
  sacCode: string
  buyer: BuyerProfile
  seller: SellerProfile
  lines: InvoiceDocumentLine[]
  subtotal: number
  taxRate: number
  cgstRate: number
  cgstAmount: number
  sgstRate: number
  sgstAmount: number
  taxTotal: number
  grandTotal: number
  amountInWords: string
  taxInWords: string
  declaration: string
}

export type InvoiceDocumentInput = {
  kind: InvoiceKind
  invoiceNumber: string
  invoiceDate: string | null
  createdAt?: string | null
  client: InvoiceClientInfo | null
  departmentName: string | null
  contactName: string | null
  articles: ArticleRequestRow[]
  subtotal: number
  taxAmount: number
  taxRate: number
  grandTotal: number
  documentContent?: string | null
  linkedProformaNumbers?: Array<string | null>
}

/** Seller details fixed in the supplied templates. */
export const SELLER_PROFILE: SellerProfile = {
  name: 'Maitree Infomed',
  addressLines: [
    '503, Sunflower Tower, Old Police Line, Kharkar Ali,',
    'Thane, West',
  ],
  email: 'maitreeinfomed@rediffmail.com',
  msme: 'MH33D0230283',
  phone: '9324060954',
  gstin: '27AAEPI9562K1Z9',
  stateName: 'Maharashtra',
  stateCode: '27',
}

/** Buyer details fixed in the supplied templates, used when the client master is incomplete. */
export const BUYER_PROFILE: BuyerProfile = {
  name: 'USV PRIVATE LIMITED',
  addressLines: [
    'Arvind Vithal Gandhi Chowk, B.S.D. Marg,',
    'Govandi, Mumbai, Suburban,',
    'Maharashtra, 400088',
  ],
  gstin: '27AAACU1366N2ZZ',
  stateName: 'Maharashtra',
  stateCode: '27',
}

export const SERVICE_CODE = '9200431'
export const SERVICE_DESCRIPTION = 'Medical Content Development & Publishing'
export const SAC_CODE = '998393'
export const PURCHASE_OF_ARTICLES = 'Purchase of Medical Articles'
export const DECLARATION =
  'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.'

/** Defaults for fields that have no database column yet. */
const DEFAULT_BUYER_ORDER_NO = '6600088911'
const DEFAULT_BUYER_ORDER_DATE = '2026-10-14'

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
]

type DocumentOverrides = {
  buyer_order_no?: string
  buyer_order_date?: string
  mode_of_payment?: string
  kind_attention?: string[]
  purchase_of?: string
  purchase_articles_of?: string
  delivery_date?: string
  service_code?: string
  service_description?: string
  sac_code?: string
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Split an ISO date into safe numeric parts; returns null for unusable values. */
function parseDateParts(
  value: string | null | undefined
): { year: number; month: number; day: number } | null {
  if (!value) {
    return null
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())

  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  }
}

/** `08-Oct-26` – the short date used by both templates. */
export function formatDocumentDate(value: string | null | undefined): string {
  const parts = parseDateParts(value)

  if (!parts) {
    return '—'
  }

  const year = String(parts.year).slice(-2)

  return `${String(parts.day).padStart(2, '0')}-${MONTH_NAMES[parts.month - 1] ?? '—'}-${year}`
}

/** `30.11.2026` – delivery date printed by the tax invoice template. */
export function formatDeliveryDate(value: string | null | undefined): string {
  const parts = parseDateParts(value)

  if (!parts) {
    return '—'
  }

  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()

  return `${String(lastDay).padStart(2, '0')}.${String(parts.month).padStart(2, '0')}.${parts.year}`
}

/** `Sep-26` – month label used in "Purchase Articles Of ...". */
export function formatMonthYear(value: string | null | undefined): string {
  const parts = parseDateParts(value)

  if (!parts) {
    return '—'
  }

  return `${MONTH_NAMES[parts.month - 1] ?? '—'}-${String(parts.year).slice(-2)}`
}

/** Indian digit grouping with two decimals: `1,23,456.78`. */
export function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function twoDigits(value: number): string {
  if (value < 20) {
    return ONES[value] ?? ''
  }

  const tens = Math.floor(value / 10)
  const ones = value % 10

  return `${TENS[tens] ?? ''}${ones ? ` ${ONES[ones]}` : ''}`.trim()
}

function threeDigits(value: number): string {
  const hundreds = Math.floor(value / 100)
  const remainder = value % 100
  const parts: string[] = []

  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} Hundred`)
  }

  if (remainder > 0) {
    parts.push(twoDigits(remainder))
  }

  return parts.join(' ')
}

function integerInWords(value: number): string {
  if (value <= 0) {
    return 'Zero'
  }

  const crore = Math.floor(value / 10000000)
  const lakh = Math.floor((value % 10000000) / 100000)
  const thousand = Math.floor((value % 100000) / 1000)
  const hundred = value % 1000
  const parts: string[] = []

  if (crore > 0) {
    parts.push(`${integerInWords(crore)} Crore`)
  }

  if (lakh > 0) {
    parts.push(`${twoDigits(lakh)} Lakh`)
  }

  if (thousand > 0) {
    parts.push(`${twoDigits(thousand)} Thousand`)
  }

  if (hundred > 0) {
    parts.push(threeDigits(hundred))
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** `INR Nineteen Thousand Eight Hundred Twenty Four Only`. */
export function amountInWords(value: number): string {
  const amount = roundMoney(Number.isFinite(value) ? Math.abs(value) : 0)
  const whole = Math.floor(amount)
  const paise = Math.round((amount - whole) * 100)
  let words = integerInWords(whole)

  if (paise > 0) {
    words = `${words} and ${twoDigits(paise)} Paise`
  }

  return `INR ${words} Only`
}

function splitAddress(location: string): string[] {
  const lines = location
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length > 1) {
    return lines
  }

  // A single-line address is split at commas into readable chunks.
  const chunks = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  if (chunks.length <= 1) {
    return [location.trim()]
  }

  const merged: string[] = []

  for (let index = 0; index < chunks.length; index += 2) {
    merged.push(chunks.slice(index, index + 2).join(', '))
  }

  return merged
}

function parseOverrides(documentContent: string | null | undefined): DocumentOverrides {
  if (!documentContent || !documentContent.trim().startsWith('{')) {
    return {}
  }

  try {
    const parsed = JSON.parse(documentContent) as Record<string, unknown>
    const overrides: DocumentOverrides = {}

    const stringValue = (key: string): string | undefined => {
      const value = parsed[key]

      return typeof value === 'string' && value.trim() ? value.trim() : undefined
    }

    overrides.buyer_order_no = stringValue('buyer_order_no')
    overrides.buyer_order_date = stringValue('buyer_order_date')
    overrides.mode_of_payment = stringValue('mode_of_payment')
    overrides.purchase_of = stringValue('purchase_of')
    overrides.purchase_articles_of = stringValue('purchase_articles_of')
    overrides.delivery_date = stringValue('delivery_date')
    overrides.service_code = stringValue('service_code')
    overrides.service_description = stringValue('service_description')
    overrides.sac_code = stringValue('sac_code')

    const attention = parsed.kind_attention

    if (Array.isArray(attention)) {
      overrides.kind_attention = attention.filter(
        (value): value is string => typeof value === 'string' && value.trim() !== ''
      )
    } else if (typeof attention === 'string' && attention.trim()) {
      overrides.kind_attention = [attention.trim()]
    }

    return overrides
  } catch {
    return {}
  }
}

/** Build the shared model consumed by the DOCX and PDF renderers. */
export function buildInvoiceDocumentData(
  input: InvoiceDocumentInput
): InvoiceDocumentData {
  const kind = input.kind
  const overrides = parseOverrides(input.documentContent)
  const invoiceDate = input.invoiceDate ?? input.createdAt ?? todayIsoDate()

  const buyer: BuyerProfile = {
    name: input.client?.company_name?.trim() || BUYER_PROFILE.name,
    addressLines: input.client?.location?.trim()
      ? splitAddress(input.client.location)
      : BUYER_PROFILE.addressLines,
    gstin: input.client?.gstin?.trim() || BUYER_PROFILE.gstin,
    stateName: BUYER_PROFILE.stateName,
    stateCode: BUYER_PROFILE.stateCode,
  }

  const computedSubtotal = roundMoney(
    input.articles.reduce(
      (total, article) => total + getArticleRate(article) * getArticleQuantity(article),
      0
    )
  )
  const subtotal =
    Number.isFinite(input.subtotal) && input.subtotal > 0
      ? roundMoney(input.subtotal)
      : computedSubtotal

  const taxRate =
    Number.isFinite(input.taxRate) && input.taxRate > 0
      ? input.taxRate
      : subtotal > 0
        ? roundMoney(((input.taxAmount || 0) / subtotal) * 100)
        : 0
  const taxTotal =
    Number.isFinite(input.taxAmount) && input.taxAmount > 0
      ? roundMoney(input.taxAmount)
      : roundMoney((subtotal * taxRate) / 100)
  const grandTotal =
    Number.isFinite(input.grandTotal) && input.grandTotal > 0
      ? roundMoney(input.grandTotal)
      : roundMoney(subtotal + taxTotal)

  const lines: InvoiceDocumentLine[] = input.articles.map((article, index) => {
    const quantity = getArticleQuantity(article)
    const rate = getArticleRate(article)

    return {
      serial: index + 1,
      description: getArticleTitle(article),
      sac: overrides.sac_code ?? SAC_CODE,
      quantity,
      rate,
      unit: '',
      amount: roundMoney(rate * quantity),
    }
  })

  const lineTotal = roundMoney(
    lines.reduce((total, line) => total + line.amount, 0)
  )
  const adjustment = roundMoney(subtotal - lineTotal)

  if (Math.abs(adjustment) > 0.005) {
    lines.push({
      serial: lines.length + 1,
      description: 'Adjustment (invoice total reconciliation)',
      sac: overrides.sac_code ?? SAC_CODE,
      quantity: 1,
      rate: adjustment,
      unit: '',
      amount: adjustment,
    })
  }

  if (lines.length === 0) {
    lines.push({
      serial: 1,
      description: 'No article requests linked to this invoice.',
      sac: overrides.sac_code ?? SAC_CODE,
      quantity: 0,
      rate: 0,
      unit: '',
      amount: 0,
    })
  }

  const requestDates = input.articles
    .map((article) => article.request_date ?? article.created_at)
    .filter((value): value is string => Boolean(value))
    .sort()

  const purchaseArticlesOf =
    overrides.purchase_articles_of ??
    formatMonthYear(requestDates[0] ?? invoiceDate)

  const estimateNumbers = (input.linkedProformaNumbers ?? [])
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)

  const purchaseArticlesLabel = /^purchase articles of/i.test(purchaseArticlesOf)
    ? purchaseArticlesOf
    : `Purchase Articles Of ${purchaseArticlesOf}`

  const purchaseArticlesLine = `${purchaseArticlesLabel}${
    kind === 'TAX' && estimateNumbers.length > 0
      ? ` (As Per Estimate : ${estimateNumbers.join(', ')})`
      : ''
  }`

  const kindAttention =
    overrides.kind_attention ??
    [input.departmentName, input.contactName]
      .map((value) => value?.trim() ?? '')
      .filter(Boolean)

  const cgstAmount = roundMoney(taxTotal / 2)
  const sgstAmount = roundMoney(taxTotal - cgstAmount)

  return {
    kind,
    title: kind === 'TAX' ? 'TAX INVOICE' : 'PROFORMA INVOICE',
    invoiceLabel: kind === 'TAX' ? 'Tax Invoice No.' : 'Proforma Invoice No.',
    invoiceNumber: input.invoiceNumber.trim(),
    invoiceDateLabel: formatDocumentDate(invoiceDate),
    buyerOrderNo:
      overrides.buyer_order_no ??
      (kind === 'TAX' ? DEFAULT_BUYER_ORDER_NO : ''),
    buyerOrderDateLabel: overrides.buyer_order_date
      ? formatDocumentDate(overrides.buyer_order_date)
      : kind === 'TAX'
        ? formatDocumentDate(DEFAULT_BUYER_ORDER_DATE)
        : '',
    modeOfPayment: overrides.mode_of_payment ?? '',
    kindAttention,
    purchaseOf: overrides.purchase_of ?? PURCHASE_OF_ARTICLES,
    purchaseArticlesOf,
    purchaseArticlesLine,
    deliveryDateLabel: overrides.delivery_date
      ? formatDocumentDate(overrides.delivery_date)
      : formatDeliveryDate(invoiceDate),
    serviceCode: overrides.service_code ?? SERVICE_CODE,
    serviceDescription: overrides.service_description ?? SERVICE_DESCRIPTION,
    sacCode: overrides.sac_code ?? SAC_CODE,
    buyer,
    seller: SELLER_PROFILE,
    lines,
    subtotal,
    taxRate,
    cgstRate: roundMoney(taxRate / 2),
    cgstAmount,
    sgstRate: roundMoney(taxRate / 2),
    sgstAmount,
    taxTotal,
    grandTotal,
    amountInWords: amountInWords(grandTotal),
    taxInWords: amountInWords(taxTotal),
    declaration: DECLARATION,
  }
}
