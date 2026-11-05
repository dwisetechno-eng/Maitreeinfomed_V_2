import type { Metadata } from 'next'

import { ProformaInvoicesManager } from '@/components/proforma/proforma-invoices-manager'

export const metadata: Metadata = {
  title: 'Proforma Invoices',
}

export default function ProformaInvoicesPage() {
  return <ProformaInvoicesManager />
}
