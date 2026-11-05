import type { Metadata } from 'next'

import { StatusMasterManager } from '@/components/masters/status-master-manager'

export const metadata: Metadata = {
  title: 'Proforma Status',
}

export default function ProformaStatusPage() {
  return (
    <StatusMasterManager
      table="proforma_status_master"
      title="Proforma Status"
      description="Define the statuses a proforma invoice moves through, from draft to settlement."
      codePlaceholder="e.g. AWAITING_APPROVAL"
      labelPlaceholder="e.g. Awaiting Approval"
    />
  )
}
