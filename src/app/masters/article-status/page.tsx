import type { Metadata } from 'next'

import { StatusMasterManager } from '@/components/masters/status-master-manager'

export const metadata: Metadata = {
  title: 'Article Status',
}

export default function ArticleStatusPage() {
  return (
    <StatusMasterManager
      table="article_status_master"
      title="Article Status"
      description="Define the statuses an article request moves through, from receipt to completion."
      codePlaceholder="e.g. UNDER_REVIEW"
      labelPlaceholder="e.g. Under Review"
    />
  )
}
