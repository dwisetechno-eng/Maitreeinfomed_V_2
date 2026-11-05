import type { Metadata } from 'next'

import { PartyMasterManager } from '@/components/masters/party-master-manager'

export const metadata: Metadata = {
  title: 'Clients',
}

export default function ClientsPage() {
  return <PartyMasterManager kind="clients" />
}
