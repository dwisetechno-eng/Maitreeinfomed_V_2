'use client'

import type { DragEvent, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { importArticlesToProforma, type ImportResult } from '@/actions/import-articles'
import {
  type ArticleRequestRow,
  getArticleQuantity,
  getArticleRate,
  getArticleTitle,
  parseArticleRequestMeta,
} from '@/lib/article-request-meta'
import { isMissingColumnError } from '@/lib/supabase-errors'
import { Alert } from '@/components/ui/alert'
import {
  FileSpreadsheetIcon,
  InboxIcon,
  RefreshIcon,
  SpinnerIcon,
  UploadIcon,
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

type TabKey = 'pending' | 'import'

type ImportedSummary = Extract<ImportResult, { ok: true }>

type CreateProformaDialogProps = {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

const DEFAULT_TAX_RATE = 18

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

  const [activeTab, setActiveTab] = useState<TabKey>('pending')

  const [pendingRows, setPendingRows] = useState<ArticleRequestRow[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [pendingRefresh, setPendingRefresh] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<ImportedSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

    setActiveTab('pending')
    setSelectedClientId('')
    setSelectedDepartmentId('')
    setSelectedContactId('')
    setSelectedIds(new Set())
    setImportFile(null)
    setImportError(null)
    setImportSummary(null)
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

  const subtotal = useMemo(
    () =>
      roundMoney(
        selectedRows.reduce(
          (total, row) => total + getArticleRate(row) * getArticleQuantity(row),
          0
        )
      ),
    [selectedRows]
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

  async function handleFile(file: File) {
    if (!selectedClientId) {
      setImportError('Select a client before importing articles.')
      return
    }

    if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
      setImportError('Only .xlsx or .xlsm files are supported.')
      return
    }

    setImportFile(file)
    setImportError(null)
    setImportSummary(null)
    setImporting(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('clientId', selectedClientId)
      if (selectedDepartmentId) {
        formData.append('departmentId', selectedDepartmentId)
      }

      const result = await importArticlesToProforma(formData)

      if (!result.ok) {
        setImportError(result.error)
        return
      }

      setImportSummary(result)
      setSelectedIds((current) => {
        const next = new Set(current)
        for (const item of result.imported) {
          next.add(item.id)
        }
        return next
      })
      setPendingRefresh((version) => version + 1)
      setImportFile(null)
    } catch (error) {
      setImportError(
        getErrorMessage(error, 'The workbook could not be uploaded. Check your connection and retry.')
      )
    } finally {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)

    if (importing) {
      return
    }

    const file = event.dataTransfer.files?.[0]

    if (file) {
      void handleFile(file)
    }
  }

  async function handleGenerate() {
    if (!selectedClientId) {
      setGenerateError('Select a client before generating an invoice.')
      return
    }

    if (selectedRows.length === 0) {
      setGenerateError('Select at least one unbilled article request.')
      return
    }

    if (!hasSupabaseEnv()) {
      setGenerateError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setGenerating(true)
    setGenerateError(null)

    const supabase = createClient()

    const basePayload: Record<string, unknown> = {
      client_id: selectedClientId,
      subtotal: roundMoney(subtotal),
      grand_total: grandTotal,
      invoice_date: new Date().toISOString().slice(0, 10),
      tax_rate: safeTaxRate,
      tax_amount: taxAmount,
    }

    if (proformaStatusCode) {
      basePayload.status_code = proformaStatusCode
    }

    const detailPayload: Record<string, unknown> = {
      ...basePayload,
      department_id: selectedDepartmentId || null,
      contact_id: selectedContactId || null,
    }

    let invoiceId: string | null = null
    let invoiceError: unknown = null

    try {
      const detailResult = await supabase
        .from('proforma_invoices')
        .insert(detailPayload)
        .select('id')
        .single()

      if (detailResult.error && isMissingColumnError(detailResult.error)) {
        const fallbackResult = await supabase
          .from('proforma_invoices')
          .insert(basePayload)
          .select('id')
          .single()

        if (fallbackResult.error) {
          invoiceError = fallbackResult.error
        } else {
          invoiceId = fallbackResult.data?.id ?? null
        }
      } else if (detailResult.error) {
        invoiceError = detailResult.error
      } else {
        invoiceId = detailResult.data?.id ?? null
      }
    } catch (error) {
      invoiceError = error
    }

    if (!invoiceId) {
      setGenerating(false)
      setGenerateError(getErrorMessage(invoiceError, 'Unable to create the proforma invoice.'))
      return
    }

    const requestIds = selectedRows.map((row) => row.id)

    try {
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
      setImportSummary(null)
      setPendingRefresh((version) => version + 1)
      onCreated?.()
      onClose()
    } catch (error) {
      // Roll the invoice back so we never leave an empty invoice behind.
      try {
        await supabase.from('proforma_invoices').delete().eq('id', invoiceId)
      } catch {
        // Best effort only.
      }

      setGenerateError(
        getErrorMessage(
          error,
          'The article requests could not be linked to the invoice. The invoice was rolled back.'
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
      description="Pick a client, then choose pending article requests or import a spreadsheet."
      headerContent={
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="proforma-client" className={labelClass}>
                Client <span className="text-rose-400">*</span>
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
            <p className="text-xs text-slate-400">
              No clients found. Add one under{' '}
              <a href="/masters/clients" className="font-medium text-emerald-300 hover:underline">
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
              <dt className="text-slate-400">Subtotal</dt>
              <dd className="text-right font-medium tabular-nums text-slate-100">
                {formatCurrency(subtotal)}
              </dd>

              <dt className="flex items-center gap-2 text-slate-400">
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
                    className="w-16 rounded-md border border-white/15 bg-slate-900 px-2 py-1 text-right text-xs tabular-nums text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </span>
              </dt>
              <dd className="text-right font-medium tabular-nums text-slate-100">
                {formatCurrency(taxAmount)}
              </dd>

              <dt className="border-t border-white/15 pt-1.5 font-semibold text-slate-100">
                Grand total
              </dt>
              <dd className="border-t border-white/15 pt-1.5 text-right text-base font-semibold tabular-nums text-slate-100">
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
                disabled={generating || !selectedClientId || selectedRows.length === 0}
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

          {selectedClient && selectedRows.length > 0 && (
            <p className="text-xs text-slate-400">
              {selectedRows.length} request{selectedRows.length === 1 ? '' : 's'} for{' '}
              <span className="font-medium text-slate-200">{selectedClient.company_name}</span> will
              be linked to this invoice.
            </p>
          )}
        </div>
      }
    >
      <div className="flex gap-1 rounded-xl bg-white/5 p-1" role="tablist" aria-label="Invoice source">
        <button
          type="button"
          role="tab"
          id="proforma-tab-pending"
          aria-selected={activeTab === 'pending'}
          aria-controls="proforma-panel-pending"
          onClick={() => setActiveTab('pending')}
          className={tabClass(activeTab === 'pending')}
        >
          Pending Unbilled Requests
          <span className={tabBadgeClass(activeTab === 'pending')}>{pendingRows.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="proforma-tab-import"
          aria-selected={activeTab === 'import'}
          aria-controls="proforma-panel-import"
          onClick={() => setActiveTab('import')}
          className={tabClass(activeTab === 'import')}
        >
          Bulk Excel Import
        </button>
      </div>

      {activeTab === 'pending' ? (
        <div
          role="tabpanel"
          id="proforma-panel-pending"
          aria-labelledby="proforma-tab-pending"
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
            <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-rose-300">Could not load article requests</p>
              <p className="mx-auto mt-1 max-w-lg text-sm text-rose-400">{pendingError}</p>
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
              description="Every article request for this client is already on an invoice, or none have been captured yet."
              action={
                <button
                  type="button"
                  onClick={() => setActiveTab('import')}
                  className={`${secondaryButtonClass} mt-4`}
                >
                  <UploadIcon className="h-4 w-4" />
                  Import from Excel
                </button>
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-xs text-slate-400">
                  {selectedRows.length} of {pendingRows.length} selected
                </p>
                <button
                  type="button"
                  onClick={() => setPendingRefresh((version) => version + 1)}
                  disabled={pendingLoading}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
                >
                  <RefreshIcon className="h-3.5 w-3.5" />
                  Refresh
                </button>
              </div>

              <div className="max-h-[42vh] overflow-auto">
                <table className="min-w-full divide-y divide-white/10 text-sm">
                  <caption className="sr-only">Pending unbilled article requests</caption>
                  <thead className="sticky top-0 z-10 bg-white/[0.04] text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <tr>
                      <th scope="col" className="w-10 px-3 py-2.5">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Select all pending requests"
                          className="h-4 w-4 rounded border-white/15 text-emerald-400 focus:ring-emerald-400"
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
                  <tbody className="divide-y divide-white/5 bg-slate-900">
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
                          className={checked ? 'bg-emerald-500/[0.08]' : 'transition-colors hover:bg-white/5'}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleRow(row.id)}
                              aria-label={`Select ${getArticleTitle(row)}`}
                              className="h-4 w-4 rounded border-white/15 text-emerald-400 focus:ring-emerald-400"
                            />
                          </td>
                          <td className="max-w-[18rem] px-3 py-3">
                            <p className="truncate font-medium text-slate-100" title={getArticleTitle(row)}>
                              {getArticleTitle(row)}
                            </p>
                            {meta?.remarks && !row.article_title && (
                              <p className="truncate text-xs text-slate-400">{meta.remarks}</p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-slate-400">{vendorName}</td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">
                            {quantity}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-slate-400">
                            {formatCurrency(rate)}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-100">
                            {formatCurrency(roundMoney(rate * quantity))}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-400">
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
          id="proforma-panel-import"
          aria-labelledby="proforma-tab-import"
          className="mt-4 space-y-3"
        >
          <label
            htmlFor="proforma-import-file"
            onDragOver={(event) => {
              event.preventDefault()
              if (!importing && selectedClientId) {
                setDragging(true)
              }
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              !selectedClientId
                ? 'cursor-not-allowed border-white/10 bg-white/[0.04]'
                : dragging
                  ? 'border-brand-500 bg-emerald-500/10'
                  : 'border-white/15 bg-slate-900 hover:border-emerald-400/50 hover:bg-emerald-500/[0.06]'
            }`}
            aria-disabled={!selectedClientId || importing}
          >
            <input
              ref={fileInputRef}
              id="proforma-import-file"
              type="file"
              accept=".xlsx,.xlsm"
              className="sr-only"
              disabled={!selectedClientId || importing}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void handleFile(file)
                }
              }}
            />

            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              {importing ? (
                <SpinnerIcon className="h-5 w-5" />
              ) : (
                <UploadIcon className="h-5 w-5" />
              )}
            </span>

            <span className="text-sm font-medium text-slate-100">
              {importing
                ? 'Importing articles…'
                : !selectedClientId
                  ? 'Select a client to enable import'
                  : 'Drop your .xlsx file here, or click to browse'}
            </span>

            <span className="text-xs text-slate-400">
              {importFile && !importing ? importFile.name : 'One worksheet per file · up to 8 MB'}
            </span>
          </label>

          {importError && (
            <Alert tone="error" onDismiss={() => setImportError(null)}>
              {importError}
            </Alert>
          )}

          {importSummary && (
            <Alert tone="success" onDismiss={() => setImportSummary(null)}>
              Imported {importSummary.imported.length} article request
              {importSummary.imported.length === 1 ? '' : 's'} and selected{' '}
              {importSummary.imported.length === 1 ? 'it' : 'them'} for this invoice.
              {importSummary.vendorsCreated.length > 0 && (
                <>
                  {' '}
                  Created {importSummary.vendorsCreated.length} vendor
                  {importSummary.vendorsCreated.length === 1 ? '' : 's'}:{' '}
                  {importSummary.vendorsCreated.join(', ')}.
                </>
              )}
              {importSummary.skipped.length > 0 && (
                <>
                  {' '}
                  Skipped {importSummary.skipped.length} row
                  {importSummary.skipped.length === 1 ? '' : 's'} without an article title.
                </>
              )}
              {importSummary.usedFallbackColumns && (
                <>
                  {' '}
                  The database is missing the optional title/rate columns; the details were stored in
                  the request notes. Apply the proforma migration to store them natively.
                </>
              )}
            </Alert>
          )}

          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
            <p className="font-medium text-slate-200">Expected columns</p>
            <p className="mt-1">
              <span className="font-medium text-slate-200">Article</span> (required),{' '}
              <span className="font-medium text-slate-200">Vendor</span>,{' '}
              <span className="font-medium text-slate-200">Quantity</span>,{' '}
              <span className="font-medium text-slate-200">Rate</span>,{' '}
              <span className="font-medium text-slate-200">Request date</span>,{' '}
              <span className="font-medium text-slate-200">Remarks</span>. Headers are matched
              case-insensitively, and common aliases such as “Title”, “Qty”, “Price” and “Notes”
              work too. Unknown vendors are created automatically and linked to the selected client.
            </p>
          </div>
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
    <div className="rounded-xl border border-dashed border-white/15 bg-slate-900 px-6 py-10 text-center">
      <InboxIcon className="mx-auto h-9 w-9 text-slate-600" />
      <p className="mt-3 text-sm font-medium text-slate-100">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{description}</p>
      {action}
    </div>
  )
}

function PendingSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-white/5 px-3 py-3.5 last:border-0">
          <div className="h-4 w-4 animate-pulse rounded bg-white/5" />
          <div className="h-4 flex-1 animate-pulse rounded bg-white/5" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-white/5 sm:block" />
          <div className="h-4 w-16 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  )
}

function tabClass(active: boolean) {
  return [
    'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400',
    active
      ? 'bg-slate-900 text-slate-100 shadow-sm'
      : 'text-slate-400 hover:bg-white/60 hover:text-slate-100',
  ].join(' ')
}

function tabBadgeClass(active: boolean) {
  return [
    'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums',
    active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-slate-400',
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
