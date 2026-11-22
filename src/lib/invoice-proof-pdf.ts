import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'

import type { InvoiceDocumentData } from '@/lib/invoice-documents'
import { MAITREE_LOGO_PNG_BASE64 } from '@/lib/maitree-logo'

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
    else { lines.push(line); line = words[i] }
  }
  lines.push(line)
  return lines
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, opts: {font:PDFFont;size:number;color?:ReturnType<typeof rgb>;maxWidth:number;lineHeight?:number}) {
  const lh = opts.lineHeight ?? opts.size * 1.35
  const lines = wrapText(text, opts.font, opts.size, opts.maxWidth)
  let cy = y
  for (const l of lines) {
    page.drawText(l, { x, y: cy, size: opts.size, font: opts.font, color: opts.color ?? rgb(0.06,0.09,0.16) })
    cy -= lh
  }
  return cy
}

function drawBox(page: PDFPage, x: number, y: number, w: number, h: number, fill?: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: rgb(0.8,0.84,0.88), borderWidth: 0.75, color: fill ?? rgb(1,1,1) })
}

export async function renderTaxInvoiceProofPdf(data: InvoiceDocumentData): Promise<Buffer> {
  const doc = await PDFDocument.create()
  let page = doc.addPage([PAGE_W, PAGE_H])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const logoBytes = Uint8Array.from(Buffer.from(MAITREE_LOGO_PNG_BASE64, 'base64'))
  const logo = await doc.embedPng(logoBytes)

  let y = PAGE_H - MARGIN

  // Letterhead block (same as tax invoice header content)
  const headerH = 112
  page.drawRectangle({ x: MARGIN, y: y - headerH, width: CONTENT_W, height: headerH, color: rgb(0.024,0.373,0.275) })
  page.drawImage(logo, { x: MARGIN + 12, y: y - 52, width: 40, height: 40 })
  const leftX = MARGIN + 62
  page.drawText(data.seller.name, { x: leftX, y: y - 24, size: 16, font: bold, color: rgb(1,1,1) })
  page.drawText('MEDICAL SCIENTIFIC SERVICES', { x: leftX, y: y - 38, size: 7, font: bold, color: rgb(0.82,0.98,0.9) })
  let sy = y - 52
  for (const line of data.seller.addressLines) { page.drawText(line, { x: leftX, y: sy, size: 8, font, color: rgb(0.91,0.96,0.94) }); sy -= 11 }
  page.drawText(`${data.seller.email}  |  Tel: ${data.seller.phone}`, { x: leftX, y: sy, size: 8, font, color: rgb(0.91,0.96,0.94) }); sy -= 11
  page.drawText(`GSTIN/UIN: ${data.seller.gstin}`, { x: leftX, y: sy, size: 8, font, color: rgb(0.91,0.96,0.94) })

  const rightX = MARGIN + CONTENT_W - 12
  const title = `PROOF FOR ARTICLES Ref - ${data.invoiceNumber}`
  const titleSize = 12
  const tw = bold.widthOfTextAtSize(title, titleSize)
  page.drawText(title, { x: rightX - tw, y: y - 28, size: titleSize, font: bold, color: rgb(1,1,1) })
  const dateLabel = `Dated ${data.invoiceDateLabel}`
  const dw = font.widthOfTextAtSize(dateLabel, 9)
  page.drawText(dateLabel, { x: rightX - dw, y: y - 46, size: 9, font, color: rgb(0.91,0.96,0.94) })

  y = y - headerH - 10
  page.drawRectangle({ x: MARGIN, y: y - 2, width: CONTENT_W, height: 2, color: rgb(0.063,0.725,0.506) })
  y -= 14

  // Party cards (both blocks)
  const colW = CONTENT_W / 2
  const cardH = 92
  const drawParty = (x:number, titleText:string, name:string, lines:string[], gstin:string, state:string) => {
    drawBox(page, x, y, colW, cardH, rgb(0.973,0.98,0.988))
    page.drawText(titleText.toUpperCase(), { x: x + 10, y: y - 16, size: 7, font: bold, color: rgb(0.024,0.373,0.275) })
    page.drawText(name, { x: x + 10, y: y - 30, size: 10, font: bold, color: rgb(0.06,0.09,0.16) })
    let ly = y - 43
    for (const l of lines.slice(0,3)) { page.drawText(l, { x: x + 10, y: ly, size: 8, font, color: rgb(0.28,0.33,0.41) }); ly -= 11 }
    page.drawText(`GSTIN/UIN: ${gstin}`, { x: x + 10, y: ly, size: 8, font, color: rgb(0.28,0.33,0.41) }); ly -= 11
    page.drawText(`State: ${state}`, { x: x + 10, y: ly, size: 8, font, color: rgb(0.28,0.33,0.41) })
  }
  drawParty(MARGIN, 'Billed From', data.seller.name, data.seller.addressLines, data.seller.gstin, `${data.seller.stateName}, Code: ${data.seller.stateCode}`)
  drawParty(MARGIN + colW, 'Billed To', data.buyer.name, data.buyer.addressLines, data.buyer.gstin, `${data.buyer.stateName}, Code: ${data.buyer.stateCode}`)
  y -= cardH + 10

  // Order/details block (both blocks as in tax invoice)
  const detailH = 64
  drawBox(page, MARGIN, y, colW, detailH)
  page.drawText('KIND ATTN', { x: MARGIN + 10, y: y - 16, size: 7, font: bold, color: rgb(0.024,0.373,0.275) })
  let ay = y - 30
  for (const l of (data.kindAttention.length ? data.kindAttention : ['??"']).slice(0,3)) { page.drawText(l, { x: MARGIN + 10, y: ay, size: 9, font, color: rgb(0.06,0.09,0.16) }); ay -= 12 }
  drawBox(page, MARGIN + colW, y, colW, detailH)
  page.drawText(' ', { x: MARGIN + colW + 10, y: y - 16, size: 7, font: bold, color: rgb(0.024,0.373,0.275) })
  const detailLines = data.purchaseArticlesLine.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)
  ay = y - 30
  for (const l of (detailLines.length ? detailLines : ['??"']).slice(0,3)) { page.drawText(l, { x: MARGIN + colW + 10, y: ay, size: 9, font, color: rgb(0.06,0.09,0.16) }); ay -= 12 }
  y -= detailH + 14

  // Table: only Sr No and Description
  const srW = 50
  const descW = CONTENT_W - srW
  const rowH = 22
  page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: rgb(0.024,0.373,0.275) })
  page.drawText('Sr No.', { x: MARGIN + 8, y: y - 14, size: 9, font: bold, color: rgb(1,1,1) })
  page.drawText('Description of Services', { x: MARGIN + srW + 8, y: y - 14, size: 9, font: bold, color: rgb(1,1,1) })
  y -= rowH

  for (let i = 0; i < data.lines.length; i++) {
    const item = data.lines[i]
    const descLines = wrapText(item.description || '', font, 9, descW - 16)
    const h = Math.max(rowH, descLines.length * 12 + 8)
    if (y - h < MARGIN + 20) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = PAGE_H - MARGIN
    }
    if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - h, width: CONTENT_W, height: h, color: rgb(0.94,0.99,0.96) })
    page.drawRectangle({ x: MARGIN, y: y - h, width: CONTENT_W, height: h, borderColor: rgb(0.8,0.84,0.88), borderWidth: 0.5 })
    page.drawLine({ start: { x: MARGIN + srW, y }, end: { x: MARGIN + srW, y: y - h }, color: rgb(0.8,0.84,0.88), thickness: 0.5 })
    page.drawText(String(item.serial), { x: MARGIN + 8, y: y - 14, size: 9, font, color: rgb(0.06,0.09,0.16) })
    let dy = y - 14
    for (const dl of descLines) { page.drawText(dl, { x: MARGIN + srW + 8, y: dy, size: 9, font, color: rgb(0.06,0.09,0.16) }); dy -= 12 }
    y -= h
  }

  const bytes = await doc.save()
  return Buffer.from(bytes)
}
