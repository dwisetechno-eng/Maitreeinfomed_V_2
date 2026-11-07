/**
 * PDF tax invoice renderer.
 *
 * Mirrors the supplied "TAX INVOICE" PDF: seller and invoice details at the
 * top, buyer/terms blocks, a per-article item table, CGST/SGST summary, amount
 * and tax in words, declaration and signatures. Built with `pdf-lib` so the
 * document can be regenerated from live invoice data.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib'

import {
  formatMoney,
  type InvoiceDocumentData,
} from '@/lib/invoice-documents'
import { MAITREE_LOGO_BASE64 } from '@/lib/maitree-logo'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 36
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BOTTOM_MARGIN = 48
const LINE_COLOR = rgb(0.45, 0.45, 0.45)
const TEXT_COLOR = rgb(0.08, 0.08, 0.08)
const HEADER_FILL = rgb(0.86, 0.9, 0.95)

type Align = 'left' | 'right' | 'center'

type RenderContext = {
  doc: PDFDocument
  page: PDFPage
  font: PDFFont
  bold: PDFFont
  italic: PDFFont
  logo: PDFImage
  top: number
}

type CellSpec = {
  text: string
  bold?: boolean
  align?: Align
  size?: number
}

type ColumnSpec = {
  width: number
  align?: Align
}

/** Standard PDF fonts only cover WinAnsi; normalise common punctuation first. */
function sanitize(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7e]/g, '')
}

function drawText(
  page: PDFPage,
  value: string,
  x: number,
  top: number,
  options: {
    font: PDFFont
    size?: number
    align?: Align
    color?: ReturnType<typeof rgb>
    right?: number
  }
): void {
  const clean = sanitize(value)

  if (!clean) {
    return
  }

  const size = options.size ?? 8.5
  const font = options.font

  if (options.align === 'right') {
    const right = options.right ?? x
    x = right - font.widthOfTextAtSize(clean, size)
  } else if (options.align === 'center') {
    x = x - font.widthOfTextAtSize(clean, size) / 2
  }

  page.drawText(clean, {
    x,
    y: PAGE_HEIGHT - top - size,
    size,
    font,
    color: options.color ?? TEXT_COLOR,
  })
}

function wrapText(
  font: PDFFont,
  value: string,
  size: number,
  maxWidth: number
): string[] {
  const paragraphs = sanitize(value).split(/\r?\n/)
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)

    if (words.length === 0) {
      lines.push('')
      continue
    }

    let current = ''

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word

      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate
        continue
      }

      if (current) {
        lines.push(current)
        current = ''
      }

      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word
        continue
      }

      // A single long word: break it across lines.
      let chunk = ''

      for (const character of word) {
        const next = chunk + character

        if (font.widthOfTextAtSize(next, size) > maxWidth && chunk) {
          lines.push(chunk)
          chunk = character
        } else {
          chunk = next
        }
      }

      current = chunk
    }

    if (current) {
      lines.push(current)
    }
  }

  return lines.length > 0 ? lines : ['']
}

function drawWrapped(
  ctx: RenderContext,
  value: string,
  x: number,
  top: number,
  options: {
    font?: PDFFont
    size?: number
    maxWidth: number
    lineHeight?: number
    color?: ReturnType<typeof rgb>
  }
): number {
  const font = options.font ?? ctx.font
  const size = options.size ?? 8.5
  const lineHeight = options.lineHeight ?? size + 2.5
  const lines = wrapText(font, value, size, options.maxWidth)

  lines.forEach((text, index) => {
    drawText(ctx.page, text, x, top + index * lineHeight, {
      font,
      size,
      color: options.color,
    })
  })

  return top + lines.length * lineHeight
}

function addPage(ctx: RenderContext): void {
  ctx.page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  ctx.top = 44
}

function rowHeight(
  ctx: RenderContext,
  row: CellSpec[],
  columns: ColumnSpec[],
  fontSize: number,
  padding: number
): number {
  const lineHeight = fontSize + 3
  let lines = 1

  row.forEach((value, index) => {
    const font = value.bold ? ctx.bold : ctx.font
    const size = value.size ?? fontSize
    const width = columns[index]?.width ?? 0
    const wrapped = wrapText(font, value.text, size, Math.max(8, width - padding * 2))
    lines = Math.max(lines, wrapped.length)
  })

  return Math.max(lines * lineHeight + padding * 2, fontSize + padding * 2 + 2)
}

function drawTable(
  ctx: RenderContext,
  options: {
    columns: ColumnSpec[]
    rows: CellSpec[][]
    top?: number
    x?: number
    fontSize?: number
    padding?: number
    headerRows?: number
    fillHeader?: boolean
    bottomLimit?: number
    boldLastRow?: boolean
  }
): number {
  const fontSize = options.fontSize ?? 8.5
  const padding = options.padding ?? 4
  const headerRows = options.headerRows ?? 0
  const bottomLimit = options.bottomLimit ?? BOTTOM_MARGIN
  const x = options.x ?? MARGIN
  const columns = options.columns
  const totalWidth = columns.reduce((total, column) => total + column.width, 0)
  const lineHeight = fontSize + 3

  if (options.top !== undefined) {
    ctx.top = options.top
  }

  const drawRow = (row: CellSpec[], rowIndex: number) => {
    const height = rowHeight(ctx, row, columns, fontSize, padding)
    const isHeader = rowIndex < headerRows
    const isLast = rowIndex === options.rows.length - 1

    if (isHeader && options.fillHeader !== false) {
      ctx.page.drawRectangle({
        x,
        y: PAGE_HEIGHT - ctx.top - height,
        width: totalWidth,
        height,
        color: HEADER_FILL,
      })
    }

    let cellX = x

    row.forEach((value, index) => {
      const column = columns[index]
      const font = value.bold || (options.boldLastRow && isLast) ? ctx.bold : ctx.font
      const size = value.size ?? fontSize
      const align = value.align ?? column.align ?? 'left'
      const maxWidth = Math.max(8, column.width - padding * 2)
      const lines = wrapText(font, value.text, size, maxWidth)

      lines.forEach((text, lineIndex) => {
        const lineTop = ctx.top + padding + lineIndex * lineHeight
        let textX = cellX + padding

        if (align === 'right') {
          textX = cellX + column.width - padding - font.widthOfTextAtSize(text, size)
        } else if (align === 'center') {
          textX =
            cellX + padding + (maxWidth - font.widthOfTextAtSize(text, size)) / 2
        }

        drawText(ctx.page, text, textX, lineTop, { font, size })
      })

      cellX += column.width
    })

    const topY = PAGE_HEIGHT - ctx.top
    const bottomY = PAGE_HEIGHT - ctx.top - height

    ctx.page.drawLine({
      start: { x, y: topY },
      end: { x: x + totalWidth, y: topY },
      thickness: 0.5,
      color: LINE_COLOR,
    })
    ctx.page.drawLine({
      start: { x, y: bottomY },
      end: { x: x + totalWidth, y: bottomY },
      thickness: 0.5,
      color: LINE_COLOR,
    })

    let borderX = x

    for (const column of columns) {
      ctx.page.drawLine({
        start: { x: borderX, y: topY },
        end: { x: borderX, y: bottomY },
        thickness: 0.5,
        color: LINE_COLOR,
      })
      borderX += column.width
    }

    ctx.page.drawLine({
      start: { x: borderX, y: topY },
      end: { x: borderX, y: bottomY },
      thickness: 0.5,
      color: LINE_COLOR,
    })

    ctx.top += height
  }

  options.rows.forEach((row, index) => {
    const height = rowHeight(ctx, row, columns, fontSize, padding)

    if (
      index >= headerRows &&
      ctx.top + height > PAGE_HEIGHT - bottomLimit
    ) {
      addPage(ctx)

      for (let headerIndex = 0; headerIndex < headerRows; headerIndex += 1) {
        drawRow(options.rows[headerIndex], headerIndex)
      }
    }

    drawRow(row, index)
  })

  return ctx.top
}

function drawHeader(ctx: RenderContext, data: InvoiceDocumentData): number {
  drawText(ctx.page, data.title, PAGE_WIDTH / 2, 20, {
    font: ctx.bold,
    size: 12,
    align: 'center',
  })

  const logoWidth = 118
  const logoHeight = (logoWidth * 109) / 405

  ctx.page.drawImage(ctx.logo, {
    x: MARGIN,
    y: PAGE_HEIGHT - 34 - logoHeight,
    width: logoWidth,
    height: logoHeight,
  })

  const seller = data.seller
  let sellerTop = 70

  drawText(ctx.page, seller.name, MARGIN, sellerTop, { font: ctx.bold, size: 10 })
  sellerTop += 14

  for (const addressLine of seller.addressLines) {
    drawText(ctx.page, addressLine, MARGIN, sellerTop, { font: ctx.font, size: 8.5 })
    sellerTop += 11
  }

  for (const text of [
    seller.email,
    `MSME no. ${seller.msme}    Tel: ${seller.phone}`,
    `GSTIN/UIN: ${seller.gstin}`,
    `State Name : ${seller.stateName}, Code : ${seller.stateCode}`,
  ]) {
    drawText(ctx.page, text, MARGIN, sellerTop, { font: ctx.font, size: 8.5 })
    sellerTop += 11
  }

  const rightX = 360
  let rightTop = 48

  drawText(ctx.page, data.invoiceLabel, rightX, rightTop, {
    font: ctx.bold,
    size: 8.5,
  })
  rightTop += 13
  drawText(ctx.page, data.invoiceNumber, rightX, rightTop, {
    font: ctx.bold,
    size: 10,
  })
  rightTop += 19
  drawText(ctx.page, 'Dated', rightX, rightTop, { font: ctx.bold, size: 8.5 })
  rightTop += 13
  drawText(ctx.page, data.invoiceDateLabel, rightX, rightTop, {
    font: ctx.bold,
    size: 9.5,
  })

  // Buyer order block.
  let orderTop = 98
  drawText(ctx.page, "Buyer's Order No.", rightX, orderTop, {
    font: ctx.bold,
    size: 8.5,
  })
  drawText(ctx.page, data.buyerOrderNo || '-', rightX + 82, orderTop, {
    font: ctx.font,
    size: 9.5,
  })
  drawText(ctx.page, 'Mode/Terms of Payment', rightX + 132, orderTop, {
    font: ctx.bold,
    size: 8,
  })
  drawText(ctx.page, data.modeOfPayment || '', rightX + 132, orderTop + 13, {
    font: ctx.font,
    size: 8.5,
  })
  orderTop += 18
  drawText(ctx.page, 'Dated', rightX, orderTop, { font: ctx.bold, size: 8.5 })
  drawText(ctx.page, data.buyerOrderDateLabel || '-', rightX + 44, orderTop, {
    font: ctx.font,
    size: 8.5,
  })

  // Terms of delivery block.
  let termsTop = 148
  drawText(ctx.page, 'Terms of Delivery', rightX, termsTop, {
    font: ctx.bold,
    size: 8.5,
  })
  termsTop += 13

  data.kindAttention.forEach((attention, index) => {
    const text = index === 0 ? `Kind Attn: ${attention}` : attention
    drawText(ctx.page, text, rightX, termsTop, { font: ctx.font, size: 8.5 })
    termsTop += 11
  })

  if (data.kind === 'TAX') {
    drawText(ctx.page, data.purchaseOf, rightX, termsTop, {
      font: ctx.font,
      size: 8.5,
    })
    termsTop += 11
  }

  termsTop = drawWrapped(ctx, data.purchaseArticlesLine, rightX, termsTop, {
    size: 8.5,
    maxWidth: 215,
  })

  if (data.kind === 'TAX') {
    drawText(ctx.page, `Delivery Date - ${data.deliveryDateLabel}`, rightX, termsTop, {
      font: ctx.font,
      size: 8.5,
    })
    termsTop += 11
  }

  // Buyer block.
  const buyer = data.buyer
  let buyerTop = 160

  drawText(ctx.page, 'Buyer (Bill to)', MARGIN, buyerTop, {
    font: ctx.bold,
    size: 8.5,
  })
  buyerTop += 13
  drawText(ctx.page, buyer.name, MARGIN, buyerTop, { font: ctx.bold, size: 10 })
  buyerTop += 15

  for (const addressLine of buyer.addressLines) {
    buyerTop = drawWrapped(ctx, addressLine, MARGIN, buyerTop, {
      size: 8.5,
      maxWidth: 250,
      lineHeight: 10.5,
    })
    buyerTop += 1
  }

  buyerTop = drawWrapped(
    ctx,
    `GSTIN/UIN : ${buyer.gstin}    State Name : ${buyer.stateName}, Code : ${buyer.stateCode}`,
    MARGIN,
    buyerTop + 2,
    { size: 8.5, maxWidth: 290, lineHeight: 10.5 }
  )

  ctx.page.drawLine({
    start: { x: MARGIN, y: PAGE_HEIGHT - 152 },
    end: { x: 330, y: PAGE_HEIGHT - 152 },
    thickness: 0.6,
    color: LINE_COLOR,
  })

  return Math.max(sellerTop, termsTop, buyerTop, rightTop)
}

function drawFooter(ctx: RenderContext): void {
  const pages = ctx.doc.getPages()

  pages.forEach((page, index) => {
    drawText(page, 'This is a Computer Generated Invoice', PAGE_WIDTH / 2, PAGE_HEIGHT - 26, {
      font: ctx.italic,
      size: 7.5,
      align: 'center',
      color: rgb(0.4, 0.4, 0.4),
    })

    if (pages.length > 1) {
      drawText(page, `Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 26, {
        font: ctx.italic,
        size: 7.5,
        align: 'right',
        color: rgb(0.4, 0.4, 0.4),
      })
    }
  })
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : formatMoney(value)
}

export async function renderTaxInvoicePdf(data: InvoiceDocumentData): Promise<Uint8Array> {
  const doc = await PDFDocument.create()

  doc.setTitle(`${data.title} ${data.invoiceNumber}`)
  doc.setAuthor('Maitree Infomed')
  doc.setCreator('Maitree Infomed Scientific Hub')

  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold)
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic)
  const logo = await doc.embedJpg(Buffer.from(MAITREE_LOGO_BASE64, 'base64'))

  const ctx: RenderContext = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    font,
    bold,
    italic,
    logo,
    top: 44,
  }

  let bottom = drawHeader(ctx, data)
  bottom += 10

  if (data.kind === 'TAX') {
    const notes = [
      `Service Code: ${data.serviceCode}`,
      `Service Description - ${data.serviceDescription}`,
      `SAC code - ${data.sacCode}`,
      data.purchaseArticlesLine,
      `Delivery Date - ${data.deliveryDateLabel}`,
    ]

    for (const note of notes) {
      bottom = drawWrapped(ctx, note, MARGIN, bottom, {
        size: 8.5,
        maxWidth: CONTENT_WIDTH,
        lineHeight: 11,
      })
    }
  }

  ctx.top = bottom + 8

  drawTable(ctx, {
    columns: [
      { width: 26, align: 'center' },
      { width: 260 },
      { width: 62, align: 'center' },
      { width: 48, align: 'right' },
      { width: 60, align: 'right' },
      { width: 24, align: 'center' },
      { width: 60, align: 'right' },
    ],
    headerRows: 1,
    rows: [
      [
        { text: 'Sl No.', bold: true, align: 'center' },
        { text: 'Description of Services', bold: true, align: 'center' },
        { text: 'HSN/SAC', bold: true, align: 'center' },
        { text: 'Quantity', bold: true, align: 'center' },
        { text: 'Rate', bold: true, align: 'center' },
        { text: 'per', bold: true, align: 'center' },
        { text: 'Amount', bold: true, align: 'center' },
      ],
      ...data.lines.map((item) => [
        { text: String(item.serial), align: 'center' as Align },
        { text: item.description },
        { text: item.sac, align: 'center' as Align },
        { text: item.quantity ? formatQuantity(item.quantity) : '', align: 'right' as Align },
        { text: item.rate ? formatMoney(item.rate) : '', align: 'right' as Align },
        { text: item.unit, align: 'center' as Align },
        { text: formatMoney(item.amount), align: 'right' as Align },
      ]),
    ],
    bottomLimit: 245,
  })

  if (ctx.top > PAGE_HEIGHT - 275) {
    addPage(ctx)
  }

  ctx.top += 8

  drawTable(ctx, {
    columns: [{ width: 340, align: 'right' }, { width: 60, align: 'center' }, { width: 140, align: 'right' }],
    rows: [
      [
        { text: 'Output CGST', align: 'right' },
        { text: `${data.cgstRate}%`, align: 'center' },
        { text: formatMoney(data.cgstAmount), align: 'right' },
      ],
      [
        { text: 'Output SGST', align: 'right' },
        { text: `${data.sgstRate}%`, align: 'center' },
        { text: formatMoney(data.sgstAmount), align: 'right' },
      ],
      [
        { text: 'Total', bold: true, align: 'right' },
        { text: '', align: 'center' },
        { text: formatMoney(data.grandTotal), bold: true, align: 'right' },
      ],
    ],
  })

  ctx.top += 12
  drawText(ctx.page, 'Amount Chargeable (in words)    E. & O.E', MARGIN, ctx.top, {
    font: ctx.bold,
    size: 8.5,
  })
  ctx.top += 13
  ctx.top = drawWrapped(ctx, data.amountInWords, MARGIN, ctx.top, {
    font: bold,
    size: 9,
    maxWidth: CONTENT_WIDTH,
    lineHeight: 11,
  })

  ctx.top += 10

  drawTable(ctx, {
    columns: [
      { width: 72 },
      { width: 88, align: 'right' },
      { width: 60, align: 'center' },
      { width: 80, align: 'right' },
      { width: 60, align: 'center' },
      { width: 80, align: 'right' },
      { width: 100, align: 'right' },
    ],
    headerRows: 1,
    rows: [
      [
        { text: 'HSN/SAC', bold: true, align: 'center' },
        { text: 'Taxable Value', bold: true, align: 'center' },
        { text: 'CGST Rate', bold: true, align: 'center' },
        { text: 'CGST Amount', bold: true, align: 'center' },
        { text: 'SGST Rate', bold: true, align: 'center' },
        { text: 'SGST Amount', bold: true, align: 'center' },
        { text: 'Total Tax Amount', bold: true, align: 'center' },
      ],
      [
        { text: data.lines[0]?.sac ?? data.sacCode, align: 'center' },
        { text: formatMoney(data.subtotal), align: 'right' },
        { text: `${data.cgstRate}%`, align: 'center' },
        { text: formatMoney(data.cgstAmount), align: 'right' },
        { text: `${data.sgstRate}%`, align: 'center' },
        { text: formatMoney(data.sgstAmount), align: 'right' },
        { text: formatMoney(data.taxTotal), align: 'right' },
      ],
      [
        { text: 'Total', bold: true },
        { text: formatMoney(data.subtotal), bold: true, align: 'right' },
        { text: '' },
        { text: formatMoney(data.cgstAmount), bold: true, align: 'right' },
        { text: '' },
        { text: formatMoney(data.sgstAmount), bold: true, align: 'right' },
        { text: formatMoney(data.taxTotal), bold: true, align: 'right' },
      ],
    ],
  })

  ctx.top += 10
  drawText(ctx.page, `Tax Amount (in words) : ${data.taxInWords}`, MARGIN, ctx.top, {
    font: ctx.bold,
    size: 8.5,
  })
  ctx.top += 16
  drawText(ctx.page, 'Declaration', MARGIN, ctx.top, { font: ctx.bold, size: 8.5 })
  ctx.top += 12
  ctx.top = drawWrapped(ctx, data.declaration, MARGIN, ctx.top, {
    size: 8.5,
    maxWidth: CONTENT_WIDTH,
    lineHeight: 10.5,
  })

  if (ctx.top > PAGE_HEIGHT - 90) {
    addPage(ctx)
  }

  ctx.top += 26
  drawText(ctx.page, "Customer's Seal and Signature", MARGIN, ctx.top, {
    font: ctx.font,
    size: 8.5,
  })
  drawText(ctx.page, 'for Maitree Infomed', PAGE_WIDTH - MARGIN, ctx.top, {
    font: ctx.font,
    size: 8.5,
    align: 'right',
  })
  ctx.top += 30
  drawText(ctx.page, 'Authorised Signatory', PAGE_WIDTH - MARGIN, ctx.top, {
    font: ctx.font,
    size: 8.5,
    align: 'right',
  })

  drawFooter(ctx)

  return doc.save()
}
