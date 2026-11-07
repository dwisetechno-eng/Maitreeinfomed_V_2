/**
 * Word (.docx) proforma invoice renderer.
 *
 * The layout mirrors the supplied "PROFORMA INVOICE" template: seller block and
 * invoice number at the top, buyer/terms, a per-article item table, GST summary
 * and signatures. It is generated from scratch with `docx` so the output can be
 * rebuilt from live data without keeping an editable template around.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
  type IBorderOptions,
} from 'docx'

import {
  formatMoney,
  type InvoiceDocumentData,
} from '@/lib/invoice-documents'
import { MAITREE_LOGO_BASE64 } from '@/lib/maitree-logo'

const FONT = 'Arial'
const CONTENT_WIDTH = 10772 // A4 width minus 1 cm margins, in twips.

const GRID_BORDER: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: '8A8A8A',
}

const NO_BORDER: IBorderOptions = {
  style: BorderStyle.NONE,
  size: 0,
  color: 'FFFFFF',
}

const TABLE_BORDERS = {
  top: GRID_BORDER,
  bottom: GRID_BORDER,
  left: GRID_BORDER,
  right: GRID_BORDER,
  insideHorizontal: GRID_BORDER,
  insideVertical: GRID_BORDER,
}

const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
}

const CELL_MARGINS = { top: 40, bottom: 40, left: 80, right: 80 }

type ParagraphOptions = {
  size?: number
  bold?: boolean
  italics?: boolean
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]
  color?: string
  after?: number
  before?: number
}

function line(
  text: string,
  options: ParagraphOptions = {}
): Paragraph {
  return new Paragraph({
    alignment: options.align,
    spacing: {
      after: options.after ?? 0,
      before: options.before ?? 0,
      line: 220,
    },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: options.size ?? 16,
        bold: options.bold,
        italics: options.italics,
        color: options.color,
      }),
    ],
  })
}

function cell(
  children: Paragraph[],
  options: {
    width?: number
    columnSpan?: number
    rowSpan?: number
    shading?: string
    verticalAlign?: (typeof VerticalAlignTable)[keyof typeof VerticalAlignTable]
    borders?: Record<string, IBorderOptions>
    margins?: typeof CELL_MARGINS
  } = {}
): TableCell {
  return new TableCell({
    children,
    width: options.width
      ? { size: options.width, type: WidthType.DXA }
      : undefined,
    columnSpan: options.columnSpan,
    rowSpan: options.rowSpan,
    shading: options.shading ? { fill: options.shading } : undefined,
    verticalAlign: options.verticalAlign,
    borders: options.borders,
    margins: options.margins ?? CELL_MARGINS,
  })
}

function headerCell(text: string, width: number): TableCell {
  return cell(
    [
      line(text, {
        size: 16,
        bold: true,
        align: AlignmentType.CENTER,
      }),
    ],
    { width, shading: 'DCE6F1', verticalAlign: VerticalAlignTable.CENTER }
  )
}

function buildHeader(data: InvoiceDocumentData): Header {
  const logo = new ImageRun({
    type: 'jpg',
    data: Buffer.from(MAITREE_LOGO_BASE64, 'base64'),
    transformation: { width: 150, height: 40 },
  })

  return new Header({
    children: [
      new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        borders: NO_BORDERS,
        rows: [
          new TableRow({
            children: [
              cell([new Paragraph({ children: [logo] })], {
                width: Math.round(CONTENT_WIDTH * 0.38),
                borders: NO_BORDERS,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
              }),
              cell(
                [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    border: {
                      bottom: {
                        style: BorderStyle.SINGLE,
                        size: 6,
                        color: '000000',
                        space: 2,
                      },
                    },
                    spacing: { before: 120, after: 60 },
                    children: [
                      new TextRun({
                        text: data.title,
                        font: FONT,
                        size: 24,
                        bold: true,
                      }),
                    ],
                  }),
                ],
                {
                  width: Math.round(CONTENT_WIDTH * 0.62),
                  borders: NO_BORDERS,
                  margins: { top: 0, bottom: 0, left: 0, right: 0 },
                  verticalAlign: VerticalAlignTable.BOTTOM,
                }
              ),
            ],
          }),
        ],
      }),
      new Paragraph({ spacing: { after: 120 } }),
    ],
  })
}

function buildFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: 'This is a Computer Generated Invoice',
            font: FONT,
            size: 14,
            color: '666666',
          }),
        ],
      }),
    ],
  })
}

function buildSellerCell(data: InvoiceDocumentData, rowSpan: number): TableCell {
  const seller = data.seller
  const children: Paragraph[] = [
    line(seller.name, { size: 20, bold: true, after: 1 }),
    ...seller.addressLines.map((text) => line(text, { size: 15 })),
    line(seller.email, { size: 15 }),
    line(`MSME no. ${seller.msme}    Tel: ${seller.phone}`, { size: 15 }),
    line(`GSTIN/UIN: ${seller.gstin}`, { size: 15 }),
    line(`State Name : ${seller.stateName}, Code : ${seller.stateCode}`, { size: 15 }),
  ]

  return cell(children, { width: Math.round(CONTENT_WIDTH * 0.55), rowSpan })
}

function buildTermsCell(data: InvoiceDocumentData, width: number, columnSpan?: number): TableCell {
  const children: Paragraph[] = [
    line('Terms of Delivery', { size: 15, bold: true }),
  ]

  if (data.kindAttention.length > 0) {
    children.push(line(`Kind Attn: ${data.kindAttention[0]}`, { size: 15 }))

    for (const extra of data.kindAttention.slice(1)) {
      children.push(line(extra, { size: 15 }))
    }
  }

  children.push(line(data.purchaseArticlesLine, { size: 15 }))

  if (data.kind === 'TAX') {
    children.push(line(`Delivery Date - ${data.deliveryDateLabel}`, { size: 15 }))
  }

  return cell(children, { width, columnSpan })
}

function buildBuyerCell(data: InvoiceDocumentData): TableCell {
  const buyer = data.buyer
  const children: Paragraph[] = [
    line('Buyer (Bill to)', { size: 15, bold: true }),
    line(buyer.name, { size: 17, bold: true }),
    ...buyer.addressLines.map((text) => line(text, { size: 15 })),
    line(
      `GSTIN/UIN : ${buyer.gstin}    State Name : ${buyer.stateName}, Code : ${buyer.stateCode}`,
      { size: 15 }
    ),
  ]

  return cell(children, { width: CONTENT_WIDTH, columnSpan: 3 })
}

function buildItemsTable(data: InvoiceDocumentData): Table {
  const widths = [650, 4500, 1200, 900, 1100, 500, 1922]
  const headers = [
    'Sl No.',
    'Description of Services',
    'HSN/SAC',
    'Quantity',
    'Rate',
    'per',
    'Amount',
  ]

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((text, index) => headerCell(text, widths[index])),
  })

  const bodyRows = data.lines.map(
    (item) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell([line(String(item.serial), { size: 15, align: AlignmentType.CENTER })], {
            width: widths[0],
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          cell([line(item.description, { size: 15 })], {
            width: widths[1],
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          cell([line(item.sac, { size: 15, align: AlignmentType.CENTER })], {
            width: widths[2],
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          cell(
            [
              line(item.quantity ? formatQuantity(item.quantity) : '', {
                size: 15,
                align: AlignmentType.RIGHT,
              }),
            ],
            { width: widths[3], verticalAlign: VerticalAlignTable.CENTER }
          ),
          cell([line(item.rate ? formatMoney(item.rate) : '', { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[4],
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          cell([line(item.unit, { size: 15, align: AlignmentType.CENTER })], {
            width: widths[5],
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          cell([line(formatMoney(item.amount), { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[6],
            verticalAlign: VerticalAlignTable.CENTER,
          }),
        ],
      })
  )

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [headerRow, ...bodyRows],
  })
}

function buildTaxTable(data: InvoiceDocumentData): Table {
  const widths = [6600, 900, 3272]

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell([line('Output CGST', { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[0],
          }),
          cell([line(`${data.cgstRate}%`, { size: 15, align: AlignmentType.CENTER })], {
            width: widths[1],
          }),
          cell([line(formatMoney(data.cgstAmount), { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[2],
          }),
        ],
      }),
      new TableRow({
        children: [
          cell([line('Output SGST', { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[0],
          }),
          cell([line(`${data.sgstRate}%`, { size: 15, align: AlignmentType.CENTER })], {
            width: widths[1],
          }),
          cell([line(formatMoney(data.sgstAmount), { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[2],
          }),
        ],
      }),
      new TableRow({
        children: [
          cell([line('Total', { size: 16, bold: true, align: AlignmentType.RIGHT })], {
            width: widths[0],
          }),
          cell([line('', { size: 15 })], { width: widths[1] }),
          cell(
            [
              line(formatMoney(data.grandTotal), {
                size: 16,
                bold: true,
                align: AlignmentType.RIGHT,
              }),
            ],
            { width: widths[2] }
          ),
        ],
      }),
    ],
  })
}

function buildGstSummaryTable(data: InvoiceDocumentData): Table {
  const widths = [1500, 1800, 1200, 1700, 1200, 1700, 1672]
  const headers = [
    'HSN/SAC',
    'Taxable Value',
    'CGST Rate',
    'CGST Amount',
    'SGST Rate',
    'SGST Amount',
    'Total Tax Amount',
  ]

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((text, index) => headerCell(text, widths[index])),
      }),
      new TableRow({
        children: [
          cell([line(data.lines[0]?.sac ?? data.sacCode, { size: 15, align: AlignmentType.CENTER })], {
            width: widths[0],
          }),
          cell([line(formatMoney(data.subtotal), { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[1],
          }),
          cell([line(`${data.cgstRate}%`, { size: 15, align: AlignmentType.CENTER })], {
            width: widths[2],
          }),
          cell([line(formatMoney(data.cgstAmount), { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[3],
          }),
          cell([line(`${data.sgstRate}%`, { size: 15, align: AlignmentType.CENTER })], {
            width: widths[4],
          }),
          cell([line(formatMoney(data.sgstAmount), { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[5],
          }),
          cell([line(formatMoney(data.taxTotal), { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[6],
          }),
        ],
      }),
      new TableRow({
        children: [
          cell([line('Total', { size: 15, bold: true })], { width: widths[0] }),
          cell(
            [
              line(formatMoney(data.subtotal), {
                size: 15,
                bold: true,
                align: AlignmentType.RIGHT,
              }),
            ],
            { width: widths[1] }
          ),
          cell([line('', { size: 15 })], { width: widths[2] }),
          cell(
            [
              line(formatMoney(data.cgstAmount), {
                size: 15,
                bold: true,
                align: AlignmentType.RIGHT,
              }),
            ],
            { width: widths[3] }
          ),
          cell([line('', { size: 15 })], { width: widths[4] }),
          cell(
            [
              line(formatMoney(data.sgstAmount), {
                size: 15,
                bold: true,
                align: AlignmentType.RIGHT,
              }),
            ],
            { width: widths[5] }
          ),
          cell(
            [
              line(formatMoney(data.taxTotal), {
                size: 15,
                bold: true,
                align: AlignmentType.RIGHT,
              }),
            ],
            { width: widths[6] }
          ),
        ],
      }),
    ],
  })
}

function buildSignatureTable(data: InvoiceDocumentData): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({ spacing: { before: 320 } }),
              line("Customer's Seal and Signature", { size: 15 }),
            ],
            { width: Math.round(CONTENT_WIDTH * 0.48), borders: NO_BORDERS }
          ),
          cell(
            [
              new Paragraph({ spacing: { before: 120 } }),
              line('for Maitree Infomed', { size: 15, align: AlignmentType.RIGHT }),
              new Paragraph({ spacing: { before: 420 } }),
              line('Authorised Signatory', { size: 15, align: AlignmentType.RIGHT }),
            ],
            { width: Math.round(CONTENT_WIDTH * 0.52), borders: NO_BORDERS }
          ),
        ],
      }),
    ],
  })
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : formatMoney(value)
}

export async function renderProformaDocx(data: InvoiceDocumentData): Promise<Buffer> {
  const topTable = new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          buildSellerCell(data, 4),
          cell(
            [
              line(data.invoiceLabel, { size: 15, bold: true }),
              line(data.invoiceNumber, { size: 18, bold: true }),
            ],
            { width: Math.round(CONTENT_WIDTH * 0.25) }
          ),
          cell(
            [
              line('Dated', { size: 15, bold: true }),
              line(data.invoiceDateLabel, { size: 17, bold: true }),
            ],
            { width: Math.round(CONTENT_WIDTH * 0.2) }
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              line("Buyer's Order No.", { size: 15, bold: true }),
              line(data.buyerOrderNo, { size: 15 }),
            ],
            { width: Math.round(CONTENT_WIDTH * 0.25) }
          ),
          cell(
            [
              line('Mode/Terms of Payment', { size: 15, bold: true }),
              line(data.modeOfPayment, { size: 15 }),
            ],
            { width: Math.round(CONTENT_WIDTH * 0.2) }
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              line('Dated', { size: 15, bold: true }),
              line(data.buyerOrderDateLabel, { size: 15 }),
            ],
            { width: Math.round(CONTENT_WIDTH * 0.25) }
          ),
          cell(
            [line('', { size: 15 })],
            { width: Math.round(CONTENT_WIDTH * 0.2) }
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          buildTermsCell(
            data,
            Math.round(CONTENT_WIDTH * 0.25) + Math.round(CONTENT_WIDTH * 0.2),
            2
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [buildBuyerCell(data)],
      }),
    ],
  })

  const children: Array<Paragraph | Table> = [
    topTable,
    new Paragraph({ spacing: { after: 120 } }),
  ]

  if (data.kind === 'TAX') {
    children.push(
      line(`Service Code: ${data.serviceCode}`, { size: 15 }),
      line(`Service Description - ${data.serviceDescription}`, { size: 15 }),
      line(`SAC code - ${data.sacCode}`, { size: 15 }),
      line(data.purchaseArticlesLine, { size: 15 }),
      line(`Delivery Date - ${data.deliveryDateLabel}`, { size: 15 }),
      new Paragraph({ spacing: { after: 100 } })
    )
  }

  children.push(
    buildItemsTable(data),
    new Paragraph({ spacing: { after: 100 } }),
    buildTaxTable(data),
    new Paragraph({ spacing: { after: 100 } }),
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: 'Amount Chargeable (in words)',
          font: FONT,
          size: 16,
          bold: true,
        }),
        new TextRun({
          text: '    E. & O.E',
          font: FONT,
          size: 14,
          italics: true,
        }),
      ],
    }),
    line(data.amountInWords, { size: 18, bold: true, after: 120 }),
    buildGstSummaryTable(data),
    new Paragraph({ spacing: { after: 100 } }),
    line(`Tax Amount (in words) : ${data.taxInWords}`, {
      size: 16,
      bold: true,
      after: 100,
    }),
    line('Declaration', { size: 16, bold: true }),
    line(data.declaration, { size: 15, after: 100 }),
    buildSignatureTable(data)
  )

  const doc = new Document({
    creator: 'Maitree Infomed',
    title: `${data.title} ${data.invoiceNumber}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 16 },
          paragraph: { spacing: { line: 220 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1440, right: 567, bottom: 720, left: 567 },
          },
        },
        headers: { default: buildHeader(data) },
        footers: { default: buildFooter() },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}
