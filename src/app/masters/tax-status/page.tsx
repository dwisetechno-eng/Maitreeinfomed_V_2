import type { Metadata } from 'next'

import { StatusMasterManager } from '@/components/masters/status-master-manager'

export const metadata: Metadata = {
  title: 'Tax Status',
}

export default function TaxStatusPage() {
  return (
    <StatusMasterManager
      table="tax_status_master"
      title="Tax Status"
      description="Define the statuses a tax invoice moves through, from issue to payment."
      codePlaceholder="e.g. PARTIALLY_PAID"
      labelPlaceholder="e.g. Partially Paid"
    />
  )
}
