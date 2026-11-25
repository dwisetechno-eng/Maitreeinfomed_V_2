import type { Metadata } from 'next'

import { ModuleDetailsPage } from '@/components/dashboard/module-details-page'

export const metadata: Metadata = {
  title: 'Article request details | Maitree Infomed',
  description: 'Article request KPIs, timeline and status breakdown.',
}

export default function ArticleRequestDetailsPage() {
  return <ModuleDetailsPage module="articles" />
}
