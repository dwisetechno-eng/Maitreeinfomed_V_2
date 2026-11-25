'use client'

import { useCallback, useEffect, useState } from 'react'

import {
  SUPABASE_SETUP_MESSAGE,
  getErrorMessage,
  hasSupabaseEnv,
} from '@/components/masters/utils'
import {
  invoiceValue,
  toNumber,
  type DashboardArticle,
  type DashboardReceipt,
  type InvoiceRow,
  type NamedOption,
  type StatusMasterRow,
} from '@/lib/dashboard'
import { createClient } from '@/utils/supabase/client'

export type DashboardSnapshot = {
  proforma: InvoiceRow[]
  tax: InvoiceRow[]
  receipts: DashboardReceipt[]
  articles: DashboardArticle[]
  statuses: StatusMasterRow[]
  proformaStatuses: StatusMasterRow[]
  taxStatuses: StatusMasterRow[]
  departments: NamedOption[]
  clients: NamedOption[]
}

type StatusMasterOption = {
  status_code: string
  status_label: string
  display_order: number | null
}

function statusRow(row: StatusMasterOption): StatusMasterRow {
  return {
    status_code: row.status_code,
    status_label: row.status_label,
    display_order: row.display_order,
    description: null,
  }
}

export function calculateKpis(snapshot: DashboardSnapshot) {
  const proformaValue = snapshot.proforma.reduce(
    (total, invoice) => total + invoiceValue(invoice),
    0
  )
  const taxValue = snapshot.tax.reduce((total, invoice) => total + invoiceValue(invoice), 0)
  const receiptValue = snapshot.receipts.reduce(
    (total, receipt) => total + toNumber(receipt.amount_received),
    0
  )

  let pending = 0
  let onProforma = 0
  let taxInvoiced = 0

  for (const article of snapshot.articles) {
    if (article.tax_invoice_id) {
      taxInvoiced += 1
    } else if (article.proforma_invoice_id) {
      onProforma += 1
    } else {
      pending += 1
    }
  }

  return {
    proformaValue,
    proformaCount: snapshot.proforma.length,
    taxValue,
    taxCount: snapshot.tax.length,
    receiptValue,
    receiptCount: snapshot.receipts.length,
    outstandingValue: Math.max(0, taxValue - receiptValue),
    pending,
    onProforma,
    taxInvoiced,
    billed: onProforma + taxInvoiced,
  }
}

export function useDashboardSnapshot() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true

    if (!silent) {
      setLoading(true)
    }

    setError(null)

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      if (!silent) {
        setLoading(false)
      }
      return
    }

    try {
      const supabase = createClient()

      const [
        proformaResult,
        taxResult,
        receiptsResult,
        articlesResult,
        statusesResult,
        proformaStatusesResult,
        taxStatusesResult,
        departmentsResult,
        clientsResult,
      ] = await Promise.all([
        supabase.from('proforma_invoices').select('*'),
        supabase.from('tax_invoices').select('*'),
        supabase
          .from('payment_receipts')
          .select('id, receipt_date, amount_received, created_at'),
        supabase
          .from('article_requests')
          .select(
            'id, client_id, department_id, status_code, request_date, created_at, proforma_invoice_id, tax_invoice_id'
          ),
        supabase
          .from('article_status_master')
          .select('status_code, status_label, display_order, description')
          .order('display_order', { ascending: true })
          .order('status_code', { ascending: true }),
        supabase
          .from('proforma_status_master')
          .select('status_code, status_label, display_order')
          .order('display_order', { ascending: true })
          .order('status_code', { ascending: true }),
        supabase
          .from('tax_status_master')
          .select('status_code, status_label, display_order')
          .order('display_order', { ascending: true })
          .order('status_code', { ascending: true }),
        supabase.from('departments').select('id, department_name').order('department_name'),
        supabase.from('clients').select('id, company_name').order('company_name'),
      ])

      const firstError =
        proformaResult.error ??
        taxResult.error ??
        receiptsResult.error ??
        articlesResult.error ??
        statusesResult.error ??
        departmentsResult.error ??
        clientsResult.error

      if (firstError) {
        throw firstError
      }

      setSnapshot({
        proforma: (proformaResult.data ?? []) as InvoiceRow[],
        tax: (taxResult.data ?? []) as InvoiceRow[],
        receipts: (receiptsResult.data ?? []) as DashboardReceipt[],
        articles: (articlesResult.data ?? []) as DashboardArticle[],
        statuses: (statusesResult.data ?? []) as StatusMasterRow[],
        proformaStatuses: (proformaStatusesResult.data ?? []).map((row) => statusRow(row)),
        taxStatuses: (taxStatusesResult.data ?? []).map((row) => statusRow(row)),
        departments: (
          (departmentsResult.data ?? []) as { id: string; department_name: string }[]
        ).map((department) => ({ id: department.id, name: department.department_name })),
        clients: ((clientsResult.data ?? []) as { id: string; company_name: string }[]).map(
          (client) => ({ id: client.id, name: client.company_name })
        ),
      })
      setLastUpdated(new Date())
    } catch (loadError) {
      setError(getErrorMessage(loadError, 'Unable to load dashboard analytics.'))
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  const reload = useCallback(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    reload()
  }, [reload])

  // Re-fetch quietly when the window regains focus or the tab becomes visible
  // again, so reversals made on another route show up without a manual refresh.
  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState !== 'visible') {
        return
      }

      void loadData({ silent: true })
    }

    window.addEventListener('focus', refreshIfVisible)
    document.addEventListener('visibilitychange', refreshIfVisible)

    return () => {
      window.removeEventListener('focus', refreshIfVisible)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [loadData])

  return { snapshot, loading, error, lastUpdated, reload }
}
