import Link from 'next/link'
import {
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Contact,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Layers,
  ReceiptText,
  Tags,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

type ModuleLink = {
  title: string
  href: string
  description: string
  icon: LucideIcon
  tone: string
}

type ModuleStats = {
  articles: number
  proformas: number
  taxInvoices: number
}

const MODULES: ModuleLink[] = [
  {
    title: 'Article Requests',
    href: '/article-requests',
    description: 'Capture, import and group incoming requests',
    icon: FileText,
    tone: 'bg-brand-50 text-brand-700',
  },
  {
    title: 'Proforma Invoices',
    href: '/proforma-invoices',
    description: 'Group unbilled requests and send a PI',
    icon: FileSpreadsheet,
    tone: 'bg-indigo-50 text-indigo-700',
  },
  {
    title: 'Tax Invoices',
    href: '/tax-invoices',
    description: 'Convert proformas into tax invoices',
    icon: ReceiptText,
    tone: 'bg-sky-50 text-sky-700',
  },
  {
    title: 'Payment Receipts',
    href: '/payment-receipts',
    description: 'Record receipts and allocate payments',
    icon: Wallet,
    tone: 'bg-emerald-50 text-emerald-700',
  },
]

const MASTERS: Array<{ label: string; href: string; icon: LucideIcon }> = [
  { label: 'Clients', href: '/masters/clients', icon: Building2 },
  { label: 'Contacts', href: '/masters/client-contacts', icon: Contact },
  { label: 'Departments', href: '/masters/departments', icon: Layers },
  { label: 'Vendors', href: '/masters/vendors', icon: Truck },
  { label: 'Article Status', href: '/masters/article-status', icon: Tags },
  { label: 'Proforma Status', href: '/masters/proforma-status', icon: CircleDollarSign },
  { label: 'Tax Status', href: '/masters/tax-status', icon: CreditCard },
]

export function ModuleLinks({ stats }: { stats?: ModuleStats }) {
  function descriptionFor(module: ModuleLink) {
    if (module.href === '/article-requests' && stats) {
      return `${stats.articles} request${stats.articles === 1 ? '' : 's'} tracked`
    }

    if (module.href === '/proforma-invoices' && stats) {
      return `${stats.proformas} proforma${stats.proformas === 1 ? '' : 's'} raised`
    }

    if (module.href === '/tax-invoices' && stats) {
      return `${stats.taxInvoices} tax invoice${stats.taxInvoices === 1 ? '' : 's'} on record`
    }

    return module.description
  }

  return (
    <section aria-labelledby="quick-access-heading" className="space-y-3">
      <div>
        <h2
          id="quick-access-heading"
          className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700"
        >
          Quick access
        </h2>
        <p className="mt-1 text-sm text-slate-600">Jump straight to a workspace module.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {MODULES.map((module) => {
          const Icon = module.icon

          return (
            <Link
              key={module.href}
              href={module.href}
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${module.tone}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                  {module.title}
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-brand-600" />
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {descriptionFor(module)}
                </span>
              </span>
            </Link>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Masters
        </span>
        {MASTERS.map((master) => {
          const Icon = master.icon

          return (
            <Link
              key={master.href}
              href={master.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-brand-300 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Icon className="h-3.5 w-3.5" />
              {master.label}
            </Link>
          )
        })}
      </div>
    </section>
  )
}
