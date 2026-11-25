import type { Metadata } from 'next'

import { ModuleDetailsPage } from '@/components/dashboard/module-details-page'

export const metadata: Metadata = {
  title: 'Tax invoice details | Maitree Infomed',
  description: 'Tax invoice receivables, pipeline and status breakdown.',
}

export default function TaxInvoiceDetailsPage() {
  return <ModuleDetailsPage module="tax" />
}
