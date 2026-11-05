import type { Metadata } from 'next'

import { ArticleRequestManager } from '@/components/article-requests/article-request-manager'

export const metadata: Metadata = {
  title: 'Article Requests',
}

export default function ArticleRequestsPage() {
  return <ArticleRequestManager />
}
