import type { Metadata } from 'next'

import { ClientContactManager } from '@/components/masters/client-contact-manager'

export const metadata: Metadata = {
  title: 'Client Contacts',
}

export default function ClientContactsPage() {
  return <ClientContactManager />
}
