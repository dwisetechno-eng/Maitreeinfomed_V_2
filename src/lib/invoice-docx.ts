/**
 * Word (.docx) invoice renderer used by both the proforma invoice and the tax
 * invoice downloads.
 *
 * The layout is generated from scratch with `docx`: a coloured letterhead band
 * with the Maitree Infomed mark, billed-from / billed-to cards, order details, a
 * zebra-striped item table and a highlighted totals block. Proforma invoices
 * use a blue theme and tax invoices the brand green, so the two documents are
 * distinguishable at a glance.
 */

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
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
  type InvoiceKind,
} from '@/lib/invoice-documents'
import { MAITREE_LOGO_PNG_BASE64 } from '@/lib/maitree-logo'

const FONT = 'Arial'
const CONTENT_WIDTH = 10466 // A4 width (11906) minus 0.5" margins on both sides.

const INK = '0F172A'
const MUTED = '475569'
const SURFACE = 'F8FAFC'
const BORDER = 'CBD5E1'
const WHITE = 'FFFFFF'

type InvoiceTheme = {
  primary: string
  primarySoft: string
  primaryPale: string
  accent: string
  headerAccent: string
  headerMuted: string
}

/** Tax invoices keep the brand green. */
const TAX_THEME: InvoiceTheme = {
  primary: '065F46',
  primarySoft: 'D1FAE5',
  primaryPale: 'F0FDF4',
  accent: '10B981',
  headerAccent: 'A7F3D0',
  headerMuted: 'E2F8EF',
}

/** Proforma invoices use a distinct blue so the two documents differ. */
const PROFORMA_THEME: InvoiceTheme = {
  primary: '1E3A8A',
  primarySoft: 'DBEAFE',
  primaryPale: 'EFF6FF',
  accent: '3B82F6',
  headerAccent: 'BFDBFE',
  headerMuted: 'DBEAFE',
}

function invoiceTheme(kind: InvoiceKind): InvoiceTheme {
  return kind === 'TAX' ? TAX_THEME : PROFORMA_THEME
}

const GRID_BORDER: IBorderOptions = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: BORDER,
}

const TABLE_BORDERS = {
  top: GRID_BORDER,
  bottom: GRID_BORDER,
  left: GRID_BORDER,
  right: GRID_BORDER,
  insideHorizontal: GRID_BORDER,
  insideVertical: GRID_BORDER,
}

const NO_BORDER: IBorderOptions = {
  style: BorderStyle.NONE,
  size: 0,
  color: WHITE,
}

const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
}

const CELL_MARGINS = { top: 60, bottom: 60, left: 110, right: 110 }

type ParagraphOptions = {
  size?: number
  bold?: boolean
  italics?: boolean
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]
  color?: string
  after?: number
  before?: number
  spacing?: number
}

function line(text: string, options: ParagraphOptions = {}): Paragraph {
  return new Paragraph({
    alignment: options.align,
    spacing: {
      after: options.after ?? 0,
      before: options.before ?? 0,
      line: options.spacing ?? 230,
    },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: options.size ?? 16,
        bold: options.bold,
        italics: options.italics,
        color: options.color ?? INK,
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
    shading: options.shading ? { fill: options.shading, color: 'auto' } : undefined,
    verticalAlign: options.verticalAlign,
    borders: options.borders,
    margins: options.margins ?? CELL_MARGINS,
  })
}

function label(text: string, color = MUTED): Paragraph {
  return line(text.toUpperCase(), {
    size: 12,
    bold: true,
    color,
    after: 30,
  })
}

function headerCell(
  text: string,
  width: number,
  align: ParagraphOptions['align'],
  theme: InvoiceTheme
): TableCell {
  return cell(
    [
      line(text, {
        size: 15,
        bold: true,
        color: WHITE,
        align: align ?? AlignmentType.LEFT,
      }),
    ],
    { width, shading: theme.primary, verticalAlign: VerticalAlignTable.CENTER }
  )
}

function buildLetterhead(data: InvoiceDocumentData): Table {
  const seller = data.seller
  const theme = invoiceTheme(data.kind)

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              new Paragraph({
                children: [
                  new ImageRun({
                    type: 'png',
                    data: Buffer.from(MAITREE_LOGO_PNG_BASE64, 'base64'),
                    transformation: { width: 44, height: 44 },
                    altText: {
                      name: 'Maitree Infomed',
                      title: 'Maitree Infomed',
                      description: 'Maitree Infomed brand mark',
                    },
                  }),
                ],
              }),
            ],
            {
              width: 980,
              shading: theme.primary,
              borders: NO_BORDERS,
              margins: { top: 160, bottom: 160, left: 200, right: 100 },
              verticalAlign: VerticalAlignTable.CENTER,
            }
          ),
          cell(
            [
              line(seller.name, { size: 34, bold: true, color: WHITE, after: 40 }),
              line('MEDICAL SCIENTIFIC SERVICES', {
                size: 12,
                bold: true,
                color: theme.headerAccent,
                after: 90,
              }),
              ...seller.addressLines.map((text) =>
                line(text, { size: 15, color: theme.headerMuted })
              ),
              line(`${seller.email}  |  Tel: ${seller.phone}`, {
                size: 15,
                color: theme.headerMuted,
              }),
              line(`MSME no. ${seller.msme}`, { size: 15, color: theme.headerMuted }),
              line(`GSTIN/UIN: ${seller.gstin}`, { size: 15, color: theme.headerMuted }),
              line(`State: ${seller.stateName}, Code: ${seller.stateCode}`, {
                size: 15,
                color: theme.headerMuted,
              }),
            ],
            {
              width: 5200,
              shading: theme.primary,
              borders: NO_BORDERS,
              margins: { top: 160, bottom: 160, left: 140, right: 140 },
              verticalAlign: VerticalAlignTable.CENTER,
            }
          ),
          cell(
            [
              line(data.title, {
                // "PROFORMA INVOICE" is a long label, so it gets a wider
                // column and a slightly smaller size than "TAX INVOICE".
                size: data.kind === 'TAX' ? 36 : 30,
                bold: true,
                color: WHITE,
                align: AlignmentType.RIGHT,
                after: 70,
              }),
              line(data.invoiceLabel, {
                size: 13,
                bold: true,
                color: theme.headerAccent,
                align: AlignmentType.RIGHT,
                after: 10,
              }),
              line(data.invoiceNumber, {
                size: 24,
                bold: true,
                color: WHITE,
                align: AlignmentType.RIGHT,
                after: 80,
              }),
              line(`Dated ${data.invoiceDateLabel}`, {
                size: 15,
                color: theme.headerMuted,
                align: AlignmentType.RIGHT,
              }),
            ],
            {
              width: CONTENT_WIDTH - 980 - 5200,
              shading: theme.primary,
              borders: NO_BORDERS,
              margins: { top: 160, bottom: 160, left: 140, right: 200 },
              verticalAlign: VerticalAlignTable.CENTER,
            }
          ),
        ],
      }),
    ],
  })
}

function buildPartyCards(data: InvoiceDocumentData): Table {
  const seller = data.seller
  const buyer = data.buyer
  const theme = invoiceTheme(data.kind)

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              label('Billed From', theme.primary),
              line(seller.name, { size: 20, bold: true, after: 40 }),
              ...seller.addressLines.map((text) => line(text, { size: 15, color: MUTED })),
              line(`GSTIN/UIN: ${seller.gstin}`, { size: 15, color: MUTED }),
              line(
                `State: ${seller.stateName}, Code: ${seller.stateCode}`,
                { size: 15, color: MUTED }
              ),
            ],
            { width: Math.round(CONTENT_WIDTH / 2), shading: SURFACE }
          ),
          cell(
            [
              label('Billed To', theme.primary),
              line(buyer.name, { size: 20, bold: true, after: 40 }),
              ...buyer.addressLines.map((text) => line(text, { size: 15, color: MUTED })),
              line(`GSTIN/UIN: ${buyer.gstin}`, { size: 15, color: MUTED }),
              line(
                `State: ${buyer.stateName}, Code: ${buyer.stateCode}`,
                { size: 15, color: MUTED }
              ),
            ],
            { width: CONTENT_WIDTH - Math.round(CONTENT_WIDTH / 2), shading: SURFACE }
          ),
        ],
      }),
    ],
  })
}

function buildOrderDetails(data: InvoiceDocumentData): Table {
  const attention = data.kindAttention.join(' · ') || '—'

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              label("Buyer's Order No."),
              line(data.buyerOrderNo || '—', { size: 17 }),
            ],
            { width: 3600 }
          ),
          cell(
            [
              label('Order Date'),
              line(data.buyerOrderDateLabel || '—', { size: 17 }),
            ],
            { width: 3433 }
          ),
          cell(
            [
              label('Mode / Terms of Payment'),
              line(data.modeOfPayment || '—', { size: 17 }),
            ],
            { width: CONTENT_WIDTH - 3600 - 3433 }
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              label('Kind Attn'),
              line(attention, { size: 17 }),
            ],
            { width: 3600 }
          ),
          cell(
            [
              label(
                data.kind === 'TAX' && data.notes ? 'Notes / Remark' : 'Purchase Articles Of'
              ),
              line(data.purchaseArticlesLine, { size: 17 }),
              ...(data.kind === 'TAX'
                ? [line(`Delivery Date - ${data.deliveryDateLabel}`, {
                    size: 15,
                    color: MUTED,
                    before: 30,
                  })]
                : []),
            ],
            { width: CONTENT_WIDTH - 3600, columnSpan: 2 }
          ),
        ],
      }),
    ],
  })
}

function buildServiceNote(data: InvoiceDocumentData): Table {
  const theme = invoiceTheme(data.kind)

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              line(
                `Service Code: ${data.serviceCode}   |   SAC code: ${data.sacCode}`,
                { size: 15, bold: true, color: theme.primary }
              ),
              line(`Service Description: ${data.serviceDescription}`, {
                size: 15,
                color: MUTED,
              }),
            ],
            {
              width: CONTENT_WIDTH,
              shading: theme.primaryPale,
              borders: NO_BORDERS,
              margins: CELL_MARGINS,
            }
          ),
        ],
      }),
    ],
  })
}

function buildItemsTable(data: InvoiceDocumentData): Table {
  const theme = invoiceTheme(data.kind)
  const widths = [600, 4100, 1100, 900, 1300, 600, 1866]
  const headers: Array<[string, number, ParagraphOptions['align']?]> = [
    ['Sl No.', widths[0], AlignmentType.CENTER],
    ['Description of Services', widths[1]],
    ['HSN/SAC', widths[2], AlignmentType.CENTER],
    ['Qty', widths[3], AlignmentType.CENTER],
    ['Rate', widths[4], AlignmentType.RIGHT],
    ['Per', widths[5], AlignmentType.CENTER],
    ['Amount', widths[6], AlignmentType.RIGHT],
  ]

  const bodyRows = data.lines.map(
    (item, index) =>
      new TableRow({
        cantSplit: true,
        children: [
          cell([line(String(item.serial), { size: 15, align: AlignmentType.CENTER })], {
            width: widths[0],
            shading: index % 2 === 1 ? theme.primaryPale : WHITE,
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          cell([line(item.description, { size: 16 })], {
            width: widths[1],
            shading: index % 2 === 1 ? theme.primaryPale : WHITE,
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          cell([line(item.sac, { size: 15, align: AlignmentType.CENTER })], {
            width: widths[2],
            shading: index % 2 === 1 ? theme.primaryPale : WHITE,
            verticalAlign: VerticalAlignTable.CENTER,
          }),
          cell(
            [
              line(item.quantity ? formatQuantity(item.quantity) : '', {
                size: 15,
                align: AlignmentType.RIGHT,
              }),
            ],
            {
              width: widths[3],
              shading: index % 2 === 1 ? theme.primaryPale : WHITE,
              verticalAlign: VerticalAlignTable.CENTER,
            }
          ),
          cell(
            [
              line(item.rate ? formatMoney(item.rate) : '', {
                size: 15,
                align: AlignmentType.RIGHT,
              }),
            ],
            {
              width: widths[4],
              shading: index % 2 === 1 ? theme.primaryPale : WHITE,
              verticalAlign: VerticalAlignTable.CENTER,
            }
          ),
          cell(
            [
              line(item.unit || 'Nos.', {
                size: 15,
                align: AlignmentType.CENTER,
              }),
            ],
            {
              width: widths[5],
              shading: index % 2 === 1 ? theme.primaryPale : WHITE,
              verticalAlign: VerticalAlignTable.CENTER,
            }
          ),
          cell([line(formatMoney(item.amount), { size: 15, align: AlignmentType.RIGHT })], {
            width: widths[6],
            shading: index % 2 === 1 ? theme.primaryPale : WHITE,
            verticalAlign: VerticalAlignTable.CENTER,
          }),
        ],
      })
  )

  const subtotalRow = new TableRow({
    cantSplit: true,
    children: [
      cell(
        [line('Taxable Value', { size: 16, bold: true, align: AlignmentType.RIGHT })],
        { width: widths[0] + widths[1] + widths[2] + widths[3] + widths[4] + widths[5], columnSpan: 6, shading: theme.primarySoft }
      ),
      cell(
        [line(formatMoney(data.subtotal), { size: 16, bold: true, align: AlignmentType.RIGHT })],
        { width: widths[6], shading: theme.primarySoft }
      ),
    ],
  })

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(([text, width, align]) => headerCell(text, width, align, theme)),
      }),
      ...bodyRows,
      subtotalRow,
    ],
  })
}

function buildTotals(data: InvoiceDocumentData): Table {
  const theme = invoiceTheme(data.kind)
  const wordsWidth = 5200
  const labelWidth = 3200
  const amountWidth = CONTENT_WIDTH - wordsWidth - labelWidth

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              label('Amount Chargeable (in words)', theme.primary),
              line(data.amountInWords, { size: 17, bold: true, after: 90 }),
              label('Tax Amount (in words)'),
              line(data.taxInWords, { size: 15, color: MUTED }),
            ],
            {
              width: wordsWidth,
              rowSpan: 4,
              shading: SURFACE,
              verticalAlign: VerticalAlignTable.TOP,
            }
          ),
          cell([line('Taxable Value', { size: 16, color: MUTED })], { width: labelWidth }),
          cell(
            [line(formatMoney(data.subtotal), { size: 16, align: AlignmentType.RIGHT })],
            { width: amountWidth }
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [line(`CGST @ ${data.cgstRate}%`, { size: 16, color: MUTED })],
            { width: labelWidth }
          ),
          cell(
            [line(formatMoney(data.cgstAmount), { size: 16, align: AlignmentType.RIGHT })],
            { width: amountWidth }
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [line(`SGST @ ${data.sgstRate}%`, { size: 16, color: MUTED })],
            { width: labelWidth }
          ),
          cell(
            [line(formatMoney(data.sgstAmount), { size: 16, align: AlignmentType.RIGHT })],
            { width: amountWidth }
          ),
        ],
      }),
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [line('GRAND TOTAL', { size: 17, bold: true, color: WHITE })],
            { width: labelWidth, shading: theme.primary }
          ),
          cell(
            [
              line(formatMoney(data.grandTotal), {
                size: 18,
                bold: true,
                color: WHITE,
                align: AlignmentType.RIGHT,
              }),
            ],
            { width: amountWidth, shading: theme.primary }
          ),
        ],
      }),
    ],
  })
}

function buildGstSummary(data: InvoiceDocumentData): Table {
  const theme = invoiceTheme(data.kind)
  const widths = [1100, 2000, 1300, 1600, 1300, 1600, 1566]
  const headers = [
    'HSN/SAC',
    'Taxable Value',
    'CGST Rate',
    'CGST Amount',
    'SGST Rate',
    'SGST Amount',
    'Total Tax',
  ]

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((text, index) =>
          headerCell(
            text,
            widths[index],
            index === 0 ? AlignmentType.CENTER : AlignmentType.CENTER,
            theme
          )
        ),
      }),
      new TableRow({
        cantSplit: true,
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
        cantSplit: true,
        children: [
          cell([line('Total', { size: 15, bold: true })], {
            width: widths[0],
            shading: theme.primarySoft,
          }),
          cell([line(formatMoney(data.subtotal), { size: 15, bold: true, align: AlignmentType.RIGHT })], {
            width: widths[1],
            shading: theme.primarySoft,
          }),
          cell([line('', { size: 15 })], { width: widths[2], shading: theme.primarySoft }),
          cell([line(formatMoney(data.cgstAmount), { size: 15, bold: true, align: AlignmentType.RIGHT })], {
            width: widths[3],
            shading: theme.primarySoft,
          }),
          cell([line('', { size: 15 })], { width: widths[4], shading: theme.primarySoft }),
          cell([line(formatMoney(data.sgstAmount), { size: 15, bold: true, align: AlignmentType.RIGHT })], {
            width: widths[5],
            shading: theme.primarySoft,
          }),
          cell([line(formatMoney(data.taxTotal), { size: 15, bold: true, align: AlignmentType.RIGHT })], {
            width: widths[6],
            shading: theme.primarySoft,
          }),
        ],
      }),
    ],
  })
}

function buildFooterBlock(data: InvoiceDocumentData): Table {
  const theme = invoiceTheme(data.kind)

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: 'fixed',
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              line('Declaration', { size: 15, bold: true, color: theme.primary, after: 30 }),
              line(data.declaration, { size: 14, color: MUTED }),
              new Paragraph({ spacing: { before: 300 } }),
              line("Customer's Seal and Signature", { size: 14, color: MUTED }),
            ],
            { width: Math.round(CONTENT_WIDTH / 2), borders: NO_BORDERS, verticalAlign: VerticalAlignTable.TOP }
          ),
          cell(
            [
              line('For Maitree Infomed', {
                size: 15,
                bold: true,
                align: AlignmentType.RIGHT,
                color: theme.primary,
              }),
              new Paragraph({ spacing: { before: 700 } }),
              line('Authorised Signatory', {
                size: 14,
                align: AlignmentType.RIGHT,
                color: MUTED,
              }),
            ],
            {
              width: CONTENT_WIDTH - Math.round(CONTENT_WIDTH / 2),
              borders: NO_BORDERS,
              verticalAlign: VerticalAlignTable.TOP,
            }
          ),
        ],
      }),
    ],
  })
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : formatMoney(value)
}

export async function renderInvoiceDocx(data: InvoiceDocumentData): Promise<Buffer> {
  const theme = invoiceTheme(data.kind)
  const children: Array<Paragraph | Table> = [
    buildLetterhead(data),
    new Paragraph({
      spacing: { before: 40, after: 160 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 18, color: theme.accent, space: 1 },
      },
      children: [],
    }),
    buildPartyCards(data),
    new Paragraph({ spacing: { after: 80 } }),
    buildOrderDetails(data),
    new Paragraph({ spacing: { after: 80 } }),
  ]

  if (data.kind === 'TAX') {
    children.push(buildServiceNote(data))
    children.push(new Paragraph({ spacing: { after: 80 } }))
  }

  children.push(
    buildItemsTable(data),
    new Paragraph({ spacing: { after: 80 } }),
    buildTotals(data),
    new Paragraph({ spacing: { after: 80 } }),
    buildGstSummary(data),
    new Paragraph({ spacing: { after: 160 } }),
    buildFooterBlock(data)
  )

  const doc = new Document({
    creator: 'Maitree Infomed',
    title: `${data.title} ${data.invoiceNumber}`,
    description: `${data.title} ${data.invoiceNumber} for ${data.buyer.name}`,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 16, color: INK },
          paragraph: { spacing: { line: 230 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 567, right: 720, bottom: 567, left: 720 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'This is a computer generated invoice. No signature is required.',
                    font: FONT,
                    size: 12,
                    color: '94A3B8',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}
