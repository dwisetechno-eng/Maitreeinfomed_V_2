import type { Metadata } from 'next'

import { DashboardAnalytics } from '@/components/dashboard/dashboard-analytics'

export const metadata: Metadata = {
  title: 'Dashboard',
}

export default function DashboardPage() {
  return <DashboardAnalytics />
}
