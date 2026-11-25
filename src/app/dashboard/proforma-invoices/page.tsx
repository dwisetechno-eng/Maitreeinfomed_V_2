import type { Metadata } from 'next'

import { ModuleDetailsPage } from '@/components/dashboard/module-details-page'

export const metadata: Metadata = {
  title: 'Proforma invoice details | Maitree Infomed',
  description: 'Proforma invoice KPIs, pipeline and status breakdown.',
}

export default function ProformaInvoiceDetailsPage() {
  return <ModuleDetailsPage module="proforma" />
}
