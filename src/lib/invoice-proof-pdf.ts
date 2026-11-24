import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import type { InvoiceDocumentData } from '@/lib/invoice-documents'

const PAGE_W = 595.28 // A4
const PAGE_H = 841.89
const MARGIN = 36
const CONTENT_W = PAGE_W - MARGIN * 2

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ['']
  const lines: string[] = []
  let line = words[0]
  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`
    if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next
    else {
      lines.push(line)
      line = words[i]
    }
  }
  lines.push(line)
  return lines
}

function drawBox(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  fill = rgb(1, 1, 1)
) {
  page.drawRectangle({
    x,
    y: y - h,
    width: w,
    height: h,
    borderColor: rgb(0.75, 0.78, 0.82),
    borderWidth: 0.75,
    color: fill,
  })
}

function drawLabel(page: PDFPage, text: string, x: number, y: number, font: PDFFont) {
  page.drawText(text.toUpperCase(), {
    x,
    y,
    size: 7,
    font,
    color: rgb(0.2, 0.24, 0.3),
  })
}

export async function renderTaxInvoiceProofPdf(data: InvoiceDocumentData): Promise<Buffer> {
  const doc = await PDFDocument.create()
  let page = doc.addPage([PAGE_W, PAGE_H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  let y = PAGE_H - MARGIN
  const colW = CONTENT_W / 2

  // "Next two blocks" used as header: party cards + order/details, no background color.
  const partyH = 96
  const drawParty = (
    x: number,
    titleText: string,
    name: string,
    lines: string[],
    gstin: string,
    state: string
  ) => {
    drawBox(page, x, y, colW, partyH)
    drawLabel(page, titleText, x + 10, y - 16, bold)
    page.drawText(name || '-', {
      x: x + 10,
      y: y - 31,
      size: 10,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    })
    let ly = y - 44
    for (const l of lines.slice(0, 3)) {
      page.drawText(l, { x: x + 10, y: ly, size: 8, font, color: rgb(0.2, 0.24, 0.3) })
      ly -= 11
    }
    page.drawText(`GSTIN/UIN: ${gstin || '-'}`, {
      x: x + 10,
      y: ly,
      size: 8,
      font,
      color: rgb(0.2, 0.24, 0.3),
    })
    ly -= 11
    page.drawText(`State: ${state || '-'}`, {
      x: x + 10,
      y: ly,
      size: 8,
      font,
      color: rgb(0.2, 0.24, 0.3),
    })
  }

  drawParty(
    MARGIN,
    'Billed From',
    data.seller.name,
    data.seller.addressLines,
    data.seller.gstin,
    `${data.seller.stateName}, Code: ${data.seller.stateCode}`
  )
  drawParty(
    MARGIN + colW,
    'Billed To',
    data.buyer.name,
    data.buyer.addressLines,
    data.buyer.gstin,
    `${data.buyer.stateName}, Code: ${data.buyer.stateCode}`
  )
  y -= partyH

  const detailH = 68
  drawBox(page, MARGIN, y, colW, detailH)
  drawLabel(page, 'Kind Attn', MARGIN + 10, y - 16, bold)
  let ay = y - 31
  for (const l of (data.kindAttention.length > 0 ? data.kindAttention : ['-']).slice(0, 3)) {
    page.drawText(l, { x: MARGIN + 10, y: ay, size: 9, font, color: rgb(0.06, 0.09, 0.16) })
    ay -= 12
  }

  drawBox(page, MARGIN + colW, y, colW, detailH)
  const detailColW = colW / 2
  drawLabel(page, "BUYER'S ORDER NO.", MARGIN + colW + 10, y - 16, bold)
  page.drawText(data.buyerOrderNo || '-', {
    x: MARGIN + colW + 10,
    y: y - 31,
    size: 9,
    font,
    color: rgb(0.06, 0.09, 0.16),
  })
  drawLabel(page, 'ORDER DATE', MARGIN + colW + detailColW + 4, y - 16, bold)
  page.drawText(data.buyerOrderDateLabel || '-', {
    x: MARGIN + colW + detailColW + 4,
    y: y - 31,
    size: 9,
    font,
    color: rgb(0.06, 0.09, 0.16),
  })
  y -= detailH + 20

  // Centered, bold, underlined heading before table.
  const title = `PROOF OF ARTICLES Ref - ${data.invoiceNumber}`
  const titleSize = 14
  const titleWidth = bold.widthOfTextAtSize(title, titleSize)
  const titleX = MARGIN + (CONTENT_W - titleWidth) / 2
  const titleY = y
  page.drawText(title, { x: titleX, y: titleY, size: titleSize, font: bold, color: rgb(0.06, 0.09, 0.16) })
  page.drawLine({
    start: { x: titleX, y: titleY - 2 },
    end: { x: titleX + titleWidth, y: titleY - 2 },
    thickness: 0.9,
    color: rgb(0.06, 0.09, 0.16),
  })
  y -= 22

  // Table: only Sr No and Description.
  const srW = 55
  const descW = CONTENT_W - srW
  const rowH = 22
  page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: rgb(1, 1, 1), borderColor: rgb(0.75,0.78,0.82), borderWidth: 0.75 })
  page.drawLine({ start: { x: MARGIN + srW, y }, end: { x: MARGIN + srW, y: y - rowH }, color: rgb(0.75,0.78,0.82), thickness: 0.75 })
  page.drawText('Sr No.', { x: MARGIN + 8, y: y - 14, size: 9, font: bold, color: rgb(0.06, 0.09, 0.16) })
  page.drawText('Description of Services', {
    x: MARGIN + srW + 8,
    y: y - 14,
    size: 9,
    font: bold,
    color: rgb(0.06, 0.09, 0.16),
  })
  y -= rowH

  for (let i = 0; i < data.lines.length; i++) {
    const item = data.lines[i]
    const descLines = wrapText(item.description || '', font, 9, descW - 16)
    const h = Math.max(rowH, descLines.length * 12 + 8)
    if (y - h < MARGIN + 20) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
      // repeat table header on new page
      page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: rgb(1, 1, 1), borderColor: rgb(0.75,0.78,0.82), borderWidth: 0.75 })
      page.drawLine({ start: { x: MARGIN + srW, y }, end: { x: MARGIN + srW, y: y - rowH }, color: rgb(0.75,0.78,0.82), thickness: 0.75 })
      page.drawText('Sr No.', { x: MARGIN + 8, y: y - 14, size: 9, font: bold, color: rgb(0.06, 0.09, 0.16) })
      page.drawText('Description of Services', { x: MARGIN + srW + 8, y: y - 14, size: 9, font: bold, color: rgb(0.06, 0.09, 0.16) })
      y -= rowH
    }
    page.drawRectangle({ x: MARGIN, y: y - h, width: CONTENT_W, height: h, borderColor: rgb(0.75,0.78,0.82), borderWidth: 0.75, color: rgb(1,1,1) })
    page.drawLine({ start: { x: MARGIN + srW, y }, end: { x: MARGIN + srW, y: y - h }, color: rgb(0.75,0.78,0.82), thickness: 0.75 })
    page.drawText(String(item.serial), { x: MARGIN + 8, y: y - 14, size: 9, font, color: rgb(0.06, 0.09, 0.16) })
    let dy = y - 14
    for (const dl of descLines) {
      page.drawText(dl, { x: MARGIN + srW + 8, y: dy, size: 9, font, color: rgb(0.06, 0.09, 0.16) })
      dy -= 12
    }
    y -= h
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}
