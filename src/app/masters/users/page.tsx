import type { Metadata } from 'next'

import { UserManager } from '@/components/masters/user-manager'

export const metadata: Metadata = {
  title: 'Users',
}

export default function UsersPage() {
  return <UserManager />
}
