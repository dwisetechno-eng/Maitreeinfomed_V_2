'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  type ArticleRequestRow,
  getArticleBatchId,
  getArticleBatchTag,
  getArticleQuantity,
  getArticleRate,
  getArticleTitle,
  parseArticleRequestMeta,
} from '@/lib/article-request-meta'
import { createProformaInvoice, DEFAULT_TAX_RATE } from '@/lib/proforma-invoices'
import { Alert } from '@/components/ui/alert'
import {
  FileSpreadsheetIcon,
  InboxIcon,
  RefreshIcon,
  SpinnerIcon,
} from '@/components/ui/icons'
import { Modal } from '@/components/ui/modal'
import {
  SUPABASE_SETUP_MESSAGE,
  formatDate,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { createClient } from '@/utils/supabase/client'

type ClientOption = { id: string; company_name: string }
type DepartmentOption = { id: string; department_name: string }
type ContactOption = { id: string; contact_name: string; email: string | null }
type VendorOption = { id: string; vendor_name: string }

type SelectionMode = 'individual' | 'batch'

type BatchGroup = {
  key: string
  batchId: string | null
  label: string
  rows: ArticleRequestRow[]
  total: number
  latest: string
}

type CreateProformaDialogProps = {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

export function CreateProformaDialog({ open, onClose, onCreated }: CreateProformaDialogProps) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [vendors, setVendors] = useState<VendorOption[]>([])
  const [proformaStatusCode, setProformaStatusCode] = useState<string | null>(null)

  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('')
  const [selectedContactId, setSelectedContactId] = useState('')

  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)

  const [mode, setMode] = useState<SelectionMode>('individual')

  const [pendingRows, setPendingRows] = useState<ArticleRequestRow[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [pendingRefresh, setPendingRefresh] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [selectedBatchKey, setSelectedBatchKey] = useState('')

  const [taxRate, setTaxRate] = useState(String(DEFAULT_TAX_RATE))
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const selectAllRef = useRef<HTMLInputElement>(null)

  const vendorNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const vendor of vendors) {
      map.set(vendor.id, vendor.vendor_name)
    }
    return map
  }, [vendors])

  // Reset transient state every time the dialog opens.
  useEffect(() => {
    if (!open) {
      return
    }

    setMode('individual')
    setSelectedClientId('')
    setSelectedDepartmentId('')
    setSelectedContactId('')
    setSelectedIds(new Set())
    setSelectedBatchKey('')
    setGenerateError(null)
    setTaxRate(String(DEFAULT_TAX_RATE))
    setPendingRows([])
  }, [open])

  // Reference data: clients, departments, vendors and the default status.
  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    async function loadReferenceData() {
      if (!hasSupabaseEnv()) {
        setReferenceError(SUPABASE_SETUP_MESSAGE)
        return
      }

      setReferenceLoading(true)
      setReferenceError(null)

      try {
        const supabase = createClient()

        const [clientsResult, departmentsResult, vendorsResult, statusResult] = await Promise.all([
          supabase.from('clients').select('id, company_name').order('company_name'),
          supabase.from('departments').select('id, department_name').order('department_name'),
          supabase.from('vendors').select('id, vendor_name').order('vendor_name'),
          supabase
            .from('proforma_status_master')
            .select('status_code')
            .order('display_order', { ascending: true })
            .order('status_code', { ascending: true })
            .limit(1)
            .maybeSingle(),
        ])

        if (cancelled) {
          return
        }

        if (clientsResult.error) {
          throw clientsResult.error
        }

        if (departmentsResult.error) {
          throw departmentsResult.error
        }

        if (vendorsResult.error) {
          throw vendorsResult.error
        }

        setClients((clientsResult.data ?? []) as ClientOption[])
        setDepartments((departmentsResult.data ?? []) as DepartmentOption[])
        setVendors((vendorsResult.data ?? []) as VendorOption[])
        setProformaStatusCode(statusResult.data?.status_code ?? null)
      } catch (error) {
        if (!cancelled) {
          setReferenceError(getErrorMessage(error, 'Unable to load clients and departments.'))
        }
      } finally {
        if (!cancelled) {
          setReferenceLoading(false)
        }
      }
    }

    void loadReferenceData()

    return () => {
      cancelled = true
    }
  }, [open])

  // Contacts for the selected client.
  useEffect(() => {
    if (!open || !selectedClientId) {
      setContacts([])
      return
    }

    let cancelled = false

    async function loadContacts() {
      setContactsLoading(true)

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('client_contacts')
          .select('id, contact_name, email')
          .eq('client_id', selectedClientId)
          .order('contact_name', { ascending: true })

        if (cancelled) {
          return
        }

        if (error) {
          throw error
        }

        setContacts((data ?? []) as ContactOption[])
      } catch {
        if (!cancelled) {
          setContacts([])
        }
      } finally {
        if (!cancelled) {
          setContactsLoading(false)
        }
      }
    }

    void loadContacts()

    return () => {
      cancelled = true
    }
  }, [open, selectedClientId])

  // Pending (unbilled) article requests for the selected client.
  useEffect(() => {
    if (!open || !selectedClientId) {
      setPendingRows([])
      setPendingError(null)
      setPendingLoading(false)
      return
    }

    let cancelled = false

    async function loadPending() {
      setPendingLoading(true)
      setPendingError(null)

      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('article_requests')
          .select('*')
          .eq('client_id', selectedClientId)
          .is('proforma_invoice_id', null)
          .is('tax_invoice_id', null)
          .order('request_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (cancelled) {
          return
        }

        if (error) {
          throw error
        }

        setPendingRows((data ?? []) as ArticleRequestRow[])
      } catch (error) {
        if (!cancelled) {
          setPendingRows([])
          setPendingError(getErrorMessage(error, 'Unable to load unbilled article requests.'))
        }
      } finally {
        if (!cancelled) {
          setPendingLoading(false)
        }
      }
    }

    void loadPending()

    return () => {
      cancelled = true
    }
  }, [open, selectedClientId, pendingRefresh])

  // Clear the selection when the client changes.
  useEffect(() => {
    setSelectedIds(new Set())
    setSelectedBatchKey('')
    setSelectedContactId('')
    setGenerateError(null)
  }, [selectedClientId])

  const selectedRows = useMemo(
    () => pendingRows.filter((row) => selectedIds.has(row.id)),
    [pendingRows, selectedIds]
  )

  const allSelected = pendingRows.length > 0 && selectedRows.length === pendingRows.length

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedRows.length > 0 && selectedRows.length < pendingRows.length
    }
  }, [selectedRows.length, pendingRows.length])

  const batchGroups = useMemo(() => {
    const groups = new Map<string, BatchGroup>()

    for (const row of pendingRows) {
      const batchId = getArticleBatchId(row)
      const tag = getArticleBatchTag(row)
      const key = batchId ?? '__ungrouped__'
      const timestamp = row.created_at ?? row.request_date ?? ''
      const amount = roundMoney(getArticleRate(row) * getArticleQuantity(row))

      const existing = groups.get(key)

      if (existing) {
        existing.rows.push(row)
        existing.total = roundMoney(existing.total + amount)
        if (timestamp > existing.latest) {
          existing.latest = timestamp
        }
      } else {
        groups.set(key, {
          key,
          batchId,
          label: tag
            ? tag
            : batchId
              ? `Batch ${batchId.slice(0, 8).toUpperCase()}`
              : 'Ungrouped requests',
          rows: [row],
          total: amount,
          latest: timestamp,
        })
      }
    }

    return [...groups.values()].sort((a, b) => {
      if (a.batchId === null) return 1
      if (b.batchId === null) return -1
      return b.latest.localeCompare(a.latest)
    })
  }, [pendingRows])

  useEffect(() => {
    if (!selectedBatchKey) {
      return
    }

    if (!batchGroups.some((group) => group.key === selectedBatchKey)) {
      setSelectedBatchKey('')
    }
  }, [batchGroups, selectedBatchKey])

  const selectedBatch = batchGroups.find((group) => group.key === selectedBatchKey) ?? null

  const effectiveRows = mode === 'batch' ? selectedBatch?.rows ?? [] : selectedRows

  const subtotal = useMemo(
    () =>
      roundMoney(
        effectiveRows.reduce(
          (total, row) => total + getArticleRate(row) * getArticleQuantity(row),
          0
        )
      ),
    [effectiveRows]
  )

  const numericTaxRate = Number(taxRate)
  const safeTaxRate = Number.isFinite(numericTaxRate) && numericTaxRate >= 0 ? numericTaxRate : 0
  const taxAmount = roundMoney((subtotal * safeTaxRate) / 100)
  const grandTotal = roundMoney(subtotal + taxAmount)

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null

  const closeDialog = useCallback(() => {
    if (generating) {
      return
    }

    onClose()
  }, [generating, onClose])

  function toggleRow(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    setGenerateError(null)
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(pendingRows.map((row) => row.id)))
    setGenerateError(null)
  }

  async function handleGenerate() {
    if (!selectedClientId) {
      setGenerateError('Select a client before generating an invoice.')
      return
    }

    if (effectiveRows.length === 0) {
      setGenerateError(
        mode === 'batch'
          ? 'Select an unbilled batch to generate an invoice.'
          : 'Select at least one unbilled article request.'
      )
      return
    }

    if (!hasSupabaseEnv()) {
      setGenerateError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setGenerating(true)
    setGenerateError(null)

    const supabase = createClient()
    let invoiceId: string | null = null

    try {
      const created = await createProformaInvoice(supabase, {
        clientId: selectedClientId,
        departmentId: selectedDepartmentId || null,
        contactId: selectedContactId || null,
        subtotal,
        taxRate: safeTaxRate,
        taxAmount,
        grandTotal,
        statusCode: proformaStatusCode,
      })

      if (!created.ok) {
        setGenerateError(
          getErrorMessage(created.error, 'Unable to create the proforma invoice.')
        )
        return
      }

      invoiceId = created.id

      const requestIds = effectiveRows.map((row) => row.id)
      const { data: linked, error: linkError } = await supabase
        .from('article_requests')
        .update({ proforma_invoice_id: invoiceId })
        .in('id', requestIds)
        .select('id')

      if (linkError) {
        throw linkError
      }

      if ((linked ?? []).length !== requestIds.length) {
        throw new Error(
          'Some article requests could not be linked to the invoice. Check the table permissions and retry.'
        )
      }

      setSelectedIds(new Set())
      setSelectedBatchKey('')
      setPendingRefresh((version) => version + 1)
      onCreated?.()
      onClose()
    } catch (error) {
      // Roll the invoice back so we never leave an empty invoice behind.
      if (invoiceId) {
        try {
          await supabase.from('proforma_invoices').delete().eq('id', invoiceId)
        } catch {
          // Best effort only.
        }
      }

      setGenerateError(
        getErrorMessage(
          error,
          invoiceId
            ? 'The article requests could not be linked to the invoice. The invoice was rolled back.'
            : 'Unable to create the proforma invoice.'
        )
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      size="4xl"
      title="Create proforma invoice"
      description="Pick a client, then select individual pending requests or a complete unbilled batch."
      headerContent={
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="proforma-client" className={labelClass}>
                Client <span className="text-red-500">*</span>
              </label>
              <select
                id="proforma-client"
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
                disabled={referenceLoading || generating}
                className={inputClass}
              >
                <option value="">
                  {referenceLoading ? 'Loading clients…' : 'Select a client'}
                </option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="proforma-department" className={labelClass}>
                Department
              </label>
              <select
                id="proforma-department"
                value={selectedDepartmentId}
                onChange={(event) => setSelectedDepartmentId(event.target.value)}
                disabled={!selectedClientId || referenceLoading || generating}
                className={inputClass}
              >
                <option value="">No department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.department_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="proforma-contact" className={labelClass}>
                Contact person
              </label>
              <select
                id="proforma-contact"
                value={selectedContactId}
                onChange={(event) => setSelectedContactId(event.target.value)}
                disabled={!selectedClientId || contactsLoading || generating}
                className={inputClass}
              >
                <option value="">
                  {contactsLoading ? 'Loading contacts…' : 'No contact person'}
                </option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.contact_name}
                    {contact.email ? ` — ${contact.email}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {referenceError && (
            <Alert tone="error" onDismiss={() => setReferenceError(null)}>
              {referenceError}
            </Alert>
          )}

          {!referenceLoading && !referenceError && clients.length === 0 && (
            <p className="text-xs text-slate-500">
              No clients found. Add one under{' '}
              <a href="/masters/clients" className="font-medium text-brand-700 hover:underline">
                Masters → Clients
              </a>{' '}
              before creating an invoice.
            </p>
          )}
        </div>
      }
      footer={
        <div className="space-y-3">
          {generateError && (
            <Alert tone="error" onDismiss={() => setGenerateError(null)}>
              {generateError}
            </Alert>
          )}

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <dl className="grid grid-cols-2 items-center gap-x-8 gap-y-1.5 text-sm sm:grid-cols-[auto_auto]">
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="text-right font-medium tabular-nums text-slate-900">
                {formatCurrency(subtotal)}
              </dd>

              <dt className="flex items-center gap-2 text-slate-500">
                GST
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={taxRate}
                    onChange={(event) => setTaxRate(event.target.value)}
                    disabled={generating}
                    aria-label="GST rate percentage"
                    className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-xs tabular-nums text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  />
                  <span className="text-xs text-slate-500">%</span>
                </span>
              </dt>
              <dd className="text-right font-medium tabular-nums text-slate-900">
                {formatCurrency(taxAmount)}
              </dd>

              <dt className="border-t border-slate-300 pt-1.5 font-semibold text-slate-900">
                Grand total
              </dt>
              <dd className="border-t border-slate-300 pt-1.5 text-right text-base font-semibold tabular-nums text-slate-900">
                {formatCurrency(grandTotal)}
              </dd>
            </dl>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={closeDialog}
                disabled={generating}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={generating || !selectedClientId || effectiveRows.length === 0}
                className={primaryButtonClass}
              >
                {generating ? (
                  <SpinnerIcon className="h-4 w-4" />
                ) : (
                  <FileSpreadsheetIcon className="h-4 w-4" />
                )}
                {generating ? 'Generating…' : 'Generate Proforma Invoice'}
              </button>
            </div>
          </div>

          {selectedClient && effectiveRows.length > 0 && (
            <p className="text-xs text-slate-500">
              {effectiveRows.length} request{effectiveRows.length === 1 ? '' : 's'} for{' '}
              <span className="font-medium text-slate-700">{selectedClient.company_name}</span> will
              be linked to this invoice.
            </p>
          )}
        </div>
      }
    >
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Invoice source">
        <button
          type="button"
          role="tab"
          id="proforma-tab-individual"
          aria-selected={mode === 'individual'}
          aria-controls="proforma-panel-individual"
          onClick={() => setMode('individual')}
          className={tabClass(mode === 'individual')}
        >
          Individual requests
          <span className={tabBadgeClass(mode === 'individual')}>{pendingRows.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="proforma-tab-batch"
          aria-selected={mode === 'batch'}
          aria-controls="proforma-panel-batch"
          onClick={() => setMode('batch')}
          className={tabClass(mode === 'batch')}
        >
          Entire unbilled batch
          <span className={tabBadgeClass(mode === 'batch')}>{batchGroups.length}</span>
        </button>
      </div>

      {mode === 'individual' ? (
        <div
          role="tabpanel"
          id="proforma-panel-individual"
          aria-labelledby="proforma-tab-individual"
          className="mt-4"
        >
          {!selectedClientId ? (
            <EmptyState
              title="Select a client to begin"
              description="Pending article requests are loaded for the client chosen above."
            />
          ) : pendingLoading ? (
            <PendingSkeleton />
          ) : pendingError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-red-700">Could not load article requests</p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-red-600">{pendingError}</p>
              <button
                type="button"
                onClick={() => setPendingRefresh((version) => version + 1)}
                className={`${secondaryButtonClass} mt-4`}
              >
                <RefreshIcon className="h-4 w-4" />
                Try again
              </button>
            </div>
          ) : pendingRows.length === 0 ? (
            <EmptyState
              title="No pending requests"
              description="Every article request for this client is already on an invoice, or none have been captured yet. Import a batch from Article Requests to add more."
              action={
                <a href="/article-requests" className={`${secondaryButtonClass} mt-4`}>
                  Go to Article Requests
                </a>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">
                  {selectedRows.length} of {pendingRows.length} selected
                </p>
                <button
                  type="button"
                  onClick={() => setPendingRefresh((version) => version + 1)}
                  disabled={pendingLoading}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900"
                >
                  <RefreshIcon className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>

              <div className="max-h-[42vh] overflow-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <caption className="sr-only">Pending unbilled article requests</caption>
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-2.5">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Select all pending requests"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Article
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Vendor
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Qty
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Rate
                      </th>
                      <th scope="col" className="px-3 py-2.5 text-right">
                        Amount
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Requested
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {pendingRows.map((row) => {
                      const checked = selectedIds.has(row.id)
                      const quantity = getArticleQuantity(row)
                      const rate = getArticleRate(row)
                      const meta = parseArticleRequestMeta(row.notes)
                      const vendorName =
                        (row.vendor_id ? vendorNames.get(row.vendor_id) : null) ??
                        meta?.vendorName ??
                        '—'

                      return (
                        <tr
                          key={row.id}
                          className={checked ? 'bg-brand-50/60' : 'transition-colors hover:bg-slate-50/70'}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRow(row.id)}
                              aria-label={`Select ${getArticleTitle(row)}`}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                          <td className="max-w-[18rem] px-3 py-3">
                            <p className="truncate font-medium text-slate-900" title={getArticleTitle(row)}>
                              {getArticleTitle(row)}
                            </p>
                            {meta?.remarks && !row.article_title && (
                              <p className="truncate text-xs text-slate-500">{meta.remarks}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-slate-600">{vendorName}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                            {quantity}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                            {formatCurrency(rate)}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-900">
                            {formatCurrency(roundMoney(rate * quantity))}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-500">
                            {formatDate(row.request_date ?? row.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          role="tabpanel"
          id="proforma-panel-batch"
          aria-labelledby="proforma-tab-batch"
          className="mt-4 space-y-3"
        >
          {!selectedClientId ? (
            <EmptyState
              title="Select a client to begin"
              description="Unbilled batches are grouped from the client's pending article requests."
            />
          ) : pendingLoading ? (
            <PendingSkeleton />
          ) : pendingError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-red-700">Could not load article requests</p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-red-600">{pendingError}</p>
              <button
                type="button"
                onClick={() => setPendingRefresh((version) => version + 1)}
                className={`${secondaryButtonClass} mt-4`}
              >
                <RefreshIcon className="h-4 w-4" />
                Try again
              </button>
            </div>
          ) : batchGroups.length === 0 ? (
            <EmptyState
              title="No unbilled batches"
              description="Import an Excel batch from Article Requests, then return here to invoice the whole batch at once."
              action={
                <a href="/article-requests" className={`${secondaryButtonClass} mt-4`}>
                  Go to Article Requests
                </a>
              }
            />
          ) : (
            <>
              <div>
                <label htmlFor="proforma-batch" className={labelClass}>
                  Unbilled batch
                </label>
                <select
                  id="proforma-batch"
                  value={selectedBatchKey}
                  onChange={(event) => {
                    setSelectedBatchKey(event.target.value)
                    setGenerateError(null)
                  }}
                  disabled={generating}
                  className={inputClass}
                >
                  <option value="">Select a batch</option>
                  {batchGroups.map((group) => (
                    <option key={group.key} value={group.key}>
                      {group.label} · {group.rows.length} request
                      {group.rows.length === 1 ? '' : 's'} · {formatCurrency(group.total)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedBatch ? (
                <div className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-medium text-slate-600">
                      {selectedBatch.label} · {selectedBatch.rows.length} request
                      {selectedBatch.rows.length === 1 ? '' : 's'}
                    </p>
                    <p className="text-xs text-slate-500">{formatCurrency(selectedBatch.total)}</p>
                  </div>
                  <div className="max-h-[36vh] overflow-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <caption className="sr-only">Selected batch article requests</caption>
                      <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <tr>
                          <th scope="col" className="px-3 py-2.5">
                            Article
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            Qty
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            Rate
                          </th>
                          <th scope="col" className="px-3 py-2.5 text-right">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {selectedBatch.rows.map((row) => {
                          const quantity = getArticleQuantity(row)
                          const rate = getArticleRate(row)

                          return (
                            <tr key={row.id}>
                              <td className="max-w-[22rem] px-3 py-2.5">
                                <p className="truncate text-slate-900" title={getArticleTitle(row)}>
                                  {getArticleTitle(row)}
                                </p>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                {quantity}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                {formatCurrency(rate)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                                {formatCurrency(roundMoney(rate * quantity))}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Choose a batch above to preview its article requests before generating the invoice.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <InboxIcon className="mx-auto h-9 w-9 text-slate-300" />
      <p className="mt-3 text-sm font-medium text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>
      {action}
    </div>
  )
}

function PendingSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-slate-100 px-3 py-3.5 last:border-0">
          <div className="h-4 w-4 animate-pulse rounded bg-slate-100" />
          <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  )
}

function tabClass(active: boolean) {
  return [
    'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
    active
      ? 'bg-white text-slate-900 shadow-sm'
      : 'text-slate-600 hover:bg-white/60 hover:text-slate-900',
  ].join(' ')
}

function tabBadgeClass(active: boolean) {
  return [
    'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
    active ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-600',
  ].join(' ')
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}
