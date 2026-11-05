import type { Metadata } from 'next'

import { TaxInvoiceManager } from '@/components/tax-invoices/tax-invoice-manager'

export const metadata: Metadata = {
  title: 'Tax Invoices',
}

export default function TaxInvoicesPage() {
  return <TaxInvoiceManager />
}
