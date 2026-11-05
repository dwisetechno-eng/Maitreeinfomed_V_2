import type { Metadata } from 'next'

import { PaymentReceiptManager } from '@/components/payment-receipts/payment-receipt-manager'

export const metadata: Metadata = {
  title: 'Payment Receipts',
}

export default function PaymentReceiptsPage() {
  return <PaymentReceiptManager />
}
