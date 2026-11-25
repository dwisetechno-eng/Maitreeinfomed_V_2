import type { Metadata } from 'next'

import { ModuleDetailsPage } from '@/components/dashboard/module-details-page'

export const metadata: Metadata = {
  title: 'Payment receipt details | Maitree Infomed',
  description: 'Payment receipt count, value and collection summary.',
}

export default function PaymentReceiptDetailsPage() {
  return <ModuleDetailsPage module="receipts" />
}
