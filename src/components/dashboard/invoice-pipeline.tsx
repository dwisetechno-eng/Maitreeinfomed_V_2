'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import { InboxIcon } from '@/components/ui/icons'
import { formatCurrency, invoiceValue, toNumber, type InvoiceRow } from '@/lib/dashboard'

type InvoicePipelineProps = {
  proforma: InvoiceRow[]
  tax: InvoiceRow[]
}

type StageConfig = {
  code: string
  label: string
  tone: string
  bar: string
  /** Stages that sit in the open / unbilled part of the pipeline. */
  openStage?: boolean
  /** Cancelled invoices are excluded from the active pipeline value. */
  inactive?: boolean
}

const PROFORMA_STAGES: StageConfig[] = [
  {
    code: 'DRAFT',
    label: 'Draft',
    tone: 'bg-slate-50 text-slate-700 ring-slate-500/20',
    bar: '#94a3b8',
    openStage: true,
  },
  {
    code: 'SENT_TO_CLIENT',
    label: 'Sent to client',
    tone: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    bar: '#0284c7',
    openStage: true,
  },
  {
    code: 'PARTIALLY_BILLED',
    label: 'Partially billed',
    tone: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    bar: '#d97706',
    openStage: true,
  },
  {
    code: 'TAX_INVOICE_GENERATED',
    label: 'Converted to tax invoice',
    tone: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    bar: '#4f46e5',
  },
  {
    code: 'CANCELLED',
    label: 'Cancelled',
    tone: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    bar: '#e11d48',
    inactive: true,
  },
]

const TAX_STAGES: StageConfig[] = [
  {
    code: 'UNPAID',
    label: 'Unpaid',
    tone: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    bar: '#d97706',
    openStage: true,
  },
  {
    code: 'PARTIALLY_PAID',
    label: 'Partially paid',
    tone: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    bar: '#0284c7',
    openStage: true,
  },
  {
    code: 'PAID',
    label: 'Paid',
    tone: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    bar: '#059669',
  },
  {
    code: 'OVERDUE',
    label: 'Overdue',
    tone: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    bar: '#e11d48',
    openStage: true,
  },
]

const UNASSIGNED_STAGE: StageConfig = {
  code: '__unassigned__',
  label: 'Unassigned',
  tone: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  bar: '#cbd5e1',
}

export function InvoicePipeline({ proforma, tax }: InvoicePipelineProps) {
  const proformaStats = useMemo(
    () => buildPipeline(proforma, PROFORMA_STAGES),
    [proforma]
  )
  const taxStats = useMemo(() => buildTaxPipeline(tax), [tax])

  return (
    <section aria-labelledby="invoice-pipeline-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2
            id="invoice-pipeline-heading"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700"
          >
            Invoice pipeline
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Where proforma invoices are waiting and how much of the tax invoicing has been
            collected.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PipelineCard
          href="/proforma-invoices"
          title="Proforma invoices"
          subtitle="Open vs converted to tax invoice"
          stats={proformaStats.stages}
          emptyLabel="No proforma invoices have been raised yet."
          headline={{
            label: 'Open pipeline',
            value: proformaStats.openValue,
            hint: `${proformaStats.openCount} of ${proformaStats.totalCount} still awaiting conversion`,
          }}
          secondary={{
            label: 'Converted',
            value: proformaStats.convertedValue,
            hint: `${proformaStats.convertedCount} proforma${
              proformaStats.convertedCount === 1 ? '' : 's'
            } moved to a tax invoice`,
          }}
        />

        <PipelineCard
          href="/tax-invoices"
          title="Tax invoices"
          subtitle="Billed, collected and outstanding"
          stats={taxStats.stages}
          emptyLabel="No tax invoices have been raised yet."
          headline={{
            label: 'Billed',
            value: taxStats.billedValue,
            hint: `${taxStats.totalCount} tax invoice${
              taxStats.totalCount === 1 ? '' : 's'
            } on record`,
          }}
          secondary={{
            label: 'Outstanding',
            value: taxStats.outstanding,
            hint: `${formatCurrency(taxStats.collected)} collected so far`,
          }}
          progress={
            taxStats.billedValue > 0
              ? {
                  label: 'Collected',
                  percent: (taxStats.collected / taxStats.billedValue) * 100,
                }
              : null
          }
        />
      </div>
    </section>
  )
}

function PipelineCard({
  href,
  title,
  subtitle,
  stats,
  emptyLabel,
  headline,
  secondary,
  progress,
}: {
  href: string
  title: string
  subtitle: string
  stats: PipelineStage[]
  emptyLabel: string
  headline: { label: string; value: number; hint: string }
  secondary: { label: string; value: number; hint: string }
  progress?: { label: string; percent: number } | null
}) {
  const active = stats.filter((stage) => stage.count > 0)
  const maxValue = active.reduce((max, stage) => Math.max(max, stage.value), 0)

  return (
    <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          Open
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-brand-50/70 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            {headline.label}
          </p>
          <p className="mt-0.5 truncate text-lg font-semibold tabular-nums text-slate-900">
            {formatCurrency(headline.value)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{headline.hint}</p>
        </div>

        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {secondary.label}
          </p>
          <p className="mt-0.5 truncate text-lg font-semibold tabular-nums text-slate-900">
            {formatCurrency(secondary.value)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">{secondary.hint}</p>
        </div>
      </div>

      {progress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{progress.label}</span>
            <span className="font-medium tabular-nums text-slate-700">
              {Math.round(progress.percent)}%
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        </div>
      )}

      {active.length === 0 ? (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center">
          <InboxIcon className="h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">{emptyLabel}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {active.map((stage) => {
            const isUnassigned = stage.code === UNASSIGNED_STAGE.code
            const stageHref = isUnassigned ? href : `${href}?status=${encodeURIComponent(stage.code)}`

            return (
              <li key={stage.code}>
                <Link
                  href={stageHref}
                  className="-mx-2 block rounded-lg px-2 py-1 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  title={`Open ${title.toLowerCase()} · ${stage.label}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${stage.tone}`}
                    >
                      {stage.label}
                    </span>
                    <span className="text-xs tabular-nums text-slate-500">
                      <span className="mr-1.5 text-sm font-semibold text-slate-900">
                        {stage.count}
                      </span>
                      {formatCurrency(stage.value)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${maxValue > 0 ? (stage.value / maxValue) * 100 : 0}%`,
                        backgroundColor: stage.bar,
                      }}
                    />
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </article>
  )
}

type PipelineStage = {
  code: string
  label: string
  tone: string
  bar: string
  count: number
  value: number
}

function buildPipeline(
  invoices: InvoiceRow[],
  stages: StageConfig[]
): {
  stages: PipelineStage[]
  totalCount: number
  totalValue: number
  openCount: number
  openValue: number
  convertedCount: number
  convertedValue: number
} {
  const groups = new Map<string, { count: number; value: number }>()
  let totalValue = 0

  for (const invoice of invoices) {
    const code = invoice.status_code ?? UNASSIGNED_STAGE.code
    const value = invoiceValue(invoice)
    const group = groups.get(code) ?? { count: 0, value: 0 }
    group.count += 1
    group.value += value
    groups.set(code, group)
    totalValue += value
  }

  const stageRows = stages.map((stage) => {
    const group = groups.get(stage.code)
    return {
      code: stage.code,
      label: stage.label,
      tone: stage.tone,
      bar: stage.bar,
      count: group?.count ?? 0,
      value: group?.value ?? 0,
    }
  })

  const unassigned = groups.get(UNASSIGNED_STAGE.code)
  if (unassigned) {
    stageRows.push({
      code: UNASSIGNED_STAGE.code,
      label: UNASSIGNED_STAGE.label,
      tone: UNASSIGNED_STAGE.tone,
      bar: UNASSIGNED_STAGE.bar,
      count: unassigned.count,
      value: unassigned.value,
    })
  }

  const openStages = new Set(
    stages.filter((stage) => stage.openStage).map((stage) => stage.code)
  )
  const converted = groups.get('TAX_INVOICE_GENERATED') ?? { count: 0, value: 0 }
  const open = Array.from(openStages).reduce(
    (total, code) => {
      const group = groups.get(code)
      return {
        count: total.count + (group?.count ?? 0),
        value: total.value + (group?.value ?? 0),
      }
    },
    { count: 0, value: 0 }
  )

  return {
    stages: stageRows,
    totalCount: invoices.length,
    totalValue,
    openCount: open.count,
    openValue: open.value,
    convertedCount: converted.count,
    convertedValue: converted.value,
  }
}

function buildTaxPipeline(invoices: InvoiceRow[]): {
  stages: PipelineStage[]
  totalCount: number
  billedValue: number
  collected: number
  outstanding: number
} {
  const groups = new Map<string, { count: number; value: number }>()
  let billedValue = 0
  let collected = 0

  for (const invoice of invoices) {
    const code = invoice.status_code ?? UNASSIGNED_STAGE.code
    const value = invoiceValue(invoice)
    const paid = Math.min(value, Math.max(0, toNumber(invoice.amount_paid)))
    const group = groups.get(code) ?? { count: 0, value: 0 }
    group.count += 1
    group.value += value
    groups.set(code, group)
    billedValue += value
    collected += paid
  }

  const stageRows = TAX_STAGES.map((stage) => {
    const group = groups.get(stage.code)
    return {
      code: stage.code,
      label: stage.label,
      tone: stage.tone,
      bar: stage.bar,
      count: group?.count ?? 0,
      value: group?.value ?? 0,
    }
  })

  const unassigned = groups.get(UNASSIGNED_STAGE.code)
  if (unassigned) {
    stageRows.push({
      code: UNASSIGNED_STAGE.code,
      label: UNASSIGNED_STAGE.label,
      tone: UNASSIGNED_STAGE.tone,
      bar: UNASSIGNED_STAGE.bar,
      count: unassigned.count,
      value: unassigned.value,
    })
  }

  return {
    stages: stageRows,
    totalCount: invoices.length,
    billedValue,
    collected,
    outstanding: Math.max(0, billedValue - collected),
  }
}
