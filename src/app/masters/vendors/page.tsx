import type { Metadata } from 'next'

import { PartyMasterManager } from '@/components/masters/party-master-manager'

export const metadata: Metadata = {
  title: 'Vendors',
}

export default function VendorsPage() {
  return <PartyMasterManager kind="vendors" />
}
