'use client'

import type { FormEvent } from 'react'
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Download,
  FileText,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  WalletCards,
} from 'lucide-react'

import type { ImportResult } from '@/actions/import-articles'
import { exportArticles } from '@/actions/import-articles'
import { AssignProformaDialog } from '@/components/article-requests/assign-proforma-dialog'
import { BatchImportDialog } from '@/components/article-requests/batch-import-dialog'
import { BatchManageDialog } from '@/components/article-requests/batch-manage-dialog'
import {
  SUPABASE_SETUP_MESSAGE,
  badgeClass,
  cardClass,
  formatCurrency,
  formatDate,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
  roundMoney,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { IconButton } from '@/components/ui/icon-button'
import { Modal } from '@/components/ui/modal'
import { SpinnerIcon } from '@/components/ui/icons'
import {
  getArticleBatchId,
  getArticleBatchTag,
  getArticleRate,
  getArticleTitle,
  type ArticleRequestRow,
} from '@/lib/article-request-meta'
import { deriveArticleStatus } from '@/lib/invoice-links'
import { isMissingColumnError, isMissingTableError } from '@/lib/supabase-errors'
import { createClient } from '@/utils/supabase/client'

type ClientRow = { id: string; company_name: string }
type DepartmentRow = { id: string; department_name: string; client_id: string | null }
type VendorRow = { id: string; vendor_name: string }
type ContactRow = { id: string; client_id: string | null; contact_name: string }
type StatusRow = { status_code: string; status_label: string; display_order: number | null }
type ProformaInfoRow = { id: string; pi_number: string | null; status_code: string | null }
type TaxInfoRow = { id: string; tax_invoice_number: string | null; status_code: string | null }

type ArticleGroup = {
  key: string
  clientLabel: string
  departments: Array<{
    key: string
    departmentLabel: string
    articles: ArticleRow[]
  }>
}

type ArticleRow = {
  id: string
  client_id: string | null
  department_id: string | null
  vendor_id: string | null
  contact_id?: string | null
  article_description: string | null
  cost_price: number | null
  quantity: number | null
  urgency: string | null
  status_code: string | null
  request_date: string | null
  proforma_invoice_id: string | null
  tax_invoice_id: string | null
  notes: string | null
  created_at: string | null
  batch_id?: string | null
  batch_tag?: string | null
}

type FormState = {
  client_id: string
  department_id: string
  contact_id: string
  article_description: string
  vendor_id: string
  cost_price: string
  quantity: string
  urgency: string
  status_code: string
  request_date: string
}

type DialogState = { mode: 'create' } | { mode: 'edit'; row: ArticleRow }

const URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

const URGENCY_TONES: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  MEDIUM: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  HIGH: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  CRITICAL: 'bg-rose-50 text-rose-700 ring-rose-600/20',
}

const STATUS_TONES: Record<string, string> = {
  REQUEST_SENT: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  AWAITED_VENDOR: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  EMAILED_CLIENT: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  PI_GENERATED: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  ON_HOLD: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

const EMPTY_FORM: FormState = {
  client_id: '',
  department_id: '',
  contact_id: '',
  article_description: '',
  vendor_id: '',
  cost_price: '0',
  quantity: '1',
  urgency: 'MEDIUM',
  status_code: '',
  request_date: new Date().toISOString().slice(0, 10),
}

export function ArticleRequestManager() {
  const [articles, setArticles] = useState<ArticleRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [vendors, setVendors] = useState<VendorRow[]>([])
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [statuses, setStatuses] = useState<StatusRow[]>([])
  const [proformaRows, setProformaRows] = useState<ProformaInfoRow[]>([])
  const [taxRows, setTaxRows] = useState<TaxInfoRow[]>([])
  const [grouped, setGrouped] = useState(true)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  const [query, setQuery] = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [billingFilter, setBillingFilter] = useState<'' | 'pending' | 'billed'>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Deep links from the dashboard pre-apply filters via the query string.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('status')
    const client = params.get('client')
    const department = params.get('department')
    const billing = params.get('billing')
    const from = params.get('from')
    const to = params.get('to')

    if (status) setStatusFilter(status)
    if (client) setClientFilter(client)
    if (department) setDepartmentFilter(department)
    if (billing === 'pending' || billing === 'billed') setBillingFilter(billing)
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) setDateFrom(from)
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) setDateTo(to)
  }, [])

  const [dialog, setDialog] = useState<DialogState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<ArticleRow | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [batchManageOpen, setBatchManageOpen] = useState(false)
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null)

  const clientNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const client of clients) {
      map.set(client.id, client.company_name)
    }
    return map
  }, [clients])

  const departmentNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const department of departments) {
      map.set(department.id, department.department_name)
    }
    return map
  }, [departments])

  const vendorNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const vendor of vendors) {
      map.set(vendor.id, vendor.vendor_name)
    }
    return map
  }, [vendors])

  const contactNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const contact of contacts) {
      map.set(contact.id, contact.contact_name)
    }
    return map
  }, [contacts])

  const statusLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const status of statuses) {
      map.set(status.status_code, status.status_label)
    }
    return map
  }, [statuses])

  const proformaMap = useMemo(() => {
    const map = new Map<string, ProformaInfoRow>()
    for (const row of proformaRows) {
      map.set(row.id, row)
    }
    return map
  }, [proformaRows])

  const taxMap = useMemo(() => {
    const map = new Map<string, TaxInfoRow>()
    for (const row of taxRows) {
      map.set(row.id, row)
    }
    return map
  }, [taxRows])

  // The status column follows the invoice lifecycle: a request on a tax
  // invoice that is paid shows COMPLETED, any other invoice link shows
  // PI_GENERATED, and unlinked requests keep their stored status.
  const articleStatuses = useMemo(() => {
    const map = new Map<string, string>()

    for (const article of articles) {
      const proforma = article.proforma_invoice_id
        ? proformaMap.get(article.proforma_invoice_id)
        : undefined
      const taxInvoice = article.tax_invoice_id ? taxMap.get(article.tax_invoice_id) : undefined

      map.set(
        article.id,
        deriveArticleStatus(article, proforma?.status_code, taxInvoice?.status_code) ?? ''
      )
    }

    return map
  }, [articles, proformaMap, taxMap])

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true)
    }
    setLoadError(null)

    if (!hasSupabaseEnv()) {
      setLoadError(SUPABASE_SETUP_MESSAGE)
      setLoading(false)
      return
    }

    try {
      const supabase = createClient()
      const [
        articlesResult,
        clientsResult,
        departmentsResult,
        vendorsResult,
        contactsResult,
        statusesResult,
        proformaResult,
        taxResult,
      ] = await Promise.all([
        supabase
          .from('article_requests')
          .select('*')
          .order('request_date', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        supabase.from('clients').select('id, company_name').order('company_name', { ascending: true }),
        supabase
          .from('departments')
          .select('id, department_name, client_id')
          .order('department_name', { ascending: true }),
        supabase.from('vendors').select('id, vendor_name').order('vendor_name', { ascending: true }),
        supabase
          .from('client_contacts')
          .select('id, client_id, contact_name')
          .order('contact_name', { ascending: true }),
        supabase
          .from('article_status_master')
          .select('status_code, status_label, display_order')
          .order('display_order', { ascending: true })
          .order('status_code', { ascending: true }),
        supabase.from('proforma_invoices').select('id, pi_number, status_code'),
        supabase.from('tax_invoices').select('id, tax_invoice_number, status_code'),
      ])

      const firstError =
        articlesResult.error ??
        clientsResult.error ??
        departmentsResult.error ??
        vendorsResult.error ??
        contactsResult.error ??
        statusesResult.error ??
        proformaResult.error

      if (firstError) {
        throw firstError
      }

      // Optional tables may be absent before the invoicing migration runs.
      if (taxResult.error && !isMissingTableError(taxResult.error) && !isMissingColumnError(taxResult.error)) {
        throw taxResult.error
      }

      setArticles((articlesResult.data ?? []) as ArticleRow[])
      setClients((clientsResult.data ?? []) as ClientRow[])
      setDepartments((departmentsResult.data ?? []) as DepartmentRow[])
      setVendors((vendorsResult.data ?? []) as VendorRow[])
      setContacts((contactsResult.data ?? []) as ContactRow[])
      setStatuses((statusesResult.data ?? []) as StatusRow[])
      setProformaRows((proformaResult.data ?? []) as ProformaInfoRow[])
      setTaxRows(taxResult.error ? [] : ((taxResult.data ?? []) as TaxInfoRow[]))
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Unable to load article requests.'))
    } finally {
      if (!options?.silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Keep dependent filters coherent when the client filter changes.
  useEffect(() => {
    if (!departmentFilter) {
      return
    }

    const department = departments.find((item) => item.id === departmentFilter)

    if (!department || (clientFilter && department.client_id !== clientFilter)) {
      setDepartmentFilter('')
    }
  }, [clientFilter, departmentFilter, departments])

  const filterDepartments = useMemo(() => {
    if (!clientFilter) {
      return departments
    }

    return departments.filter((department) => department.client_id === clientFilter)
  }, [clientFilter, departments])

  const formDepartments = useMemo(() => {
    if (!form.client_id) {
      return []
    }

    return departments.filter((department) => department.client_id === form.client_id)
  }, [departments, form.client_id])

  const formContacts = useMemo(() => {
    if (!form.client_id) {
      return []
    }

    return contacts.filter((contact) => contact.client_id === form.client_id)
  }, [contacts, form.client_id])

  const filteredArticles = useMemo(() => {
    const term = query.trim().toLowerCase()

    const filtered = articles.filter((article) => {
      if (clientFilter && article.client_id !== clientFilter) {
        return false
      }

      if (departmentFilter && article.department_id !== departmentFilter) {
        return false
      }

      if (vendorFilter && article.vendor_id !== vendorFilter) {
        return false
      }

      if (urgencyFilter && normalizeUrgency(article.urgency) !== urgencyFilter) {
        return false
      }

      if (statusFilter && (articleStatuses.get(article.id) ?? '') !== statusFilter) {
        return false
      }

      if (billingFilter) {
        const billed = Boolean(article.proforma_invoice_id || article.tax_invoice_id)
        if (billingFilter === 'billed' ? !billed : billed) {
          return false
        }
      }

      if (dateFrom || dateTo) {
        const day = (article.request_date ?? article.created_at ?? '').slice(0, 10)
        if (!day) {
          return false
        }
        if (dateFrom && day < dateFrom) {
          return false
        }
        if (dateTo && day > dateTo) {
          return false
        }
      }

      if (!term) {
        return true
      }

      return [
        displayDescription(article),
        clientNames.get(article.client_id ?? '') ?? '',
        departmentNames.get(article.department_id ?? '') ?? '',
        vendorNames.get(article.vendor_id ?? '') ?? '',
        article.contact_id ? contactNames.get(article.contact_id) ?? '' : '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })

    return filtered.sort(compareLatestFirst)
  }, [
    articles,
    articleStatuses,
    billingFilter,
    clientFilter,
    clientNames,
    contactNames,
    dateFrom,
    dateTo,
    departmentFilter,
    departmentNames,
    query,
    statusFilter,
    urgencyFilter,
    vendorFilter,
    vendorNames,
  ])

  const articleGroups = useMemo<ArticleGroup[]>(() => {
    const clients = new Map<
      string,
      {
        key: string
        clientLabel: string
        departments: Map<string, { key: string; departmentLabel: string; articles: ArticleRow[] }>
      }
    >()

    for (const article of filteredArticles) {
      const clientKey = article.client_id ?? '__none__'
      const clientLabel = article.client_id
        ? clientNames.get(article.client_id) ?? 'Unknown client'
        : 'No client'
      const departmentKey = article.department_id ?? '__none__'
      const departmentLabel = article.department_id
        ? departmentNames.get(article.department_id) ?? 'Unknown department'
        : 'No department'

      let client = clients.get(clientKey)

      if (!client) {
        client = { key: clientKey, clientLabel, departments: new Map() }
        clients.set(clientKey, client)
      }

      let department = client.departments.get(departmentKey)

      if (!department) {
        department = {
          key: `${clientKey}:${departmentKey}`,
          departmentLabel,
          articles: [],
        }
        client.departments.set(departmentKey, department)
      }

      department.articles.push(article)
    }

    return [...clients.values()]
      .sort((a, b) => a.clientLabel.localeCompare(b.clientLabel))
      .map((client) => ({
        key: client.key,
        clientLabel: client.clientLabel,
        departments: [...client.departments.values()].sort((a, b) =>
          a.departmentLabel.localeCompare(b.departmentLabel)
        ),
      }))
  }, [clientNames, departmentNames, filteredArticles])

  const selectableFiltered = useMemo(
    () =>
      filteredArticles.filter(
        (article) => !article.tax_invoice_id && !article.proforma_invoice_id
      ),
    [filteredArticles]
  )

  const selectedArticles = useMemo(
    () => articles.filter((article) => selectedIds.has(article.id)),
    [articles, selectedIds]
  )

  const selectedClientIds = useMemo(
    () => new Set(selectedArticles.map((article) => article.client_id ?? '')),
    [selectedArticles]
  )

  const allVisibleSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((article) => selectedIds.has(article.id))

  const assignClientId =
    selectedClientIds.size === 1 ? [...selectedClientIds][0] : ''

  const assignSubtotal = roundMoney(
    selectedArticles.reduce(
      (total, article) => total + unitCost(article) * unitQuantity(article),
      0
    )
  )

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
  }

  function toggleAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (allVisibleSelected) {
        for (const article of selectableFiltered) {
          next.delete(article.id)
        }
      } else {
        for (const article of selectableFiltered) {
          next.add(article.id)
        }
      }

      return next
    })
  }

  function openCreateDialog() {
    setForm({
      ...EMPTY_FORM,
      client_id: clients[0]?.id ?? '',
      status_code: statuses[0]?.status_code ?? '',
    })
    setFormError(null)
    setDialog({ mode: 'create' })
  }

  async function handleExport() {
    if (filteredArticles.length === 0) {
      return
    }

    setExporting(true)

    try {
      const result = await exportArticles(filteredArticles.map((article) => article.id))

      if (!result.ok) {
        setNotice({ tone: 'error', message: result.error })
        return
      }

      downloadBase64(result.base64, result.filename)
      setNotice({
        tone: 'success',
        message: `Exported ${filteredArticles.length} article request${
          filteredArticles.length === 1 ? '' : 's'
        }.`,
      })
    } catch (exportError) {
      setNotice({
        tone: 'error',
        message: getErrorMessage(exportError, 'Could not export the article requests.'),
      })
    } finally {
      setExporting(false)
    }
  }

  function downloadBase64(base64: string, filename: string) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }

    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  function openEditDialog(row: ArticleRow) {
    setForm({
      client_id: row.client_id ?? '',
      department_id: row.department_id ?? '',
      contact_id: row.contact_id ?? '',
      article_description: displayDescription(row),
      vendor_id: row.vendor_id ?? '',
      cost_price: String(unitCost(row)),
      quantity: String(unitQuantity(row)),
      urgency: normalizeUrgency(row.urgency),
      status_code: row.status_code ?? statuses[0]?.status_code ?? '',
      request_date: row.request_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    })
    setFormError(null)
    setDialog({ mode: 'edit', row })
  }

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function handleClientChange(clientId: string) {
    setForm((current) => {
      const department = departments.find((item) => item.id === current.department_id)
      const contact = contacts.find((item) => item.id === current.contact_id)

      return {
        ...current,
        client_id: clientId,
        department_id: department?.client_id === clientId ? current.department_id : '',
        contact_id: contact?.client_id === clientId ? current.contact_id : '',
      }
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!dialog) {
      return
    }

    const description = form.article_description.trim()
    const costPrice = Number(form.cost_price)
    const quantity = Number(form.quantity)

    if (!form.client_id) {
      setFormError('Select a client for this article request.')
      return
    }

    if (!description) {
      setFormError('Add a short description of the article.')
      return
    }

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      setFormError('Cost price must be zero or a positive number.')
      return
    }

    if (!Number.isFinite(quantity) || quantity < 1) {
      setFormError('Quantity must be at least 1.')
      return
    }

    if (!hasSupabaseEnv()) {
      setFormError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      client_id: form.client_id,
      department_id: form.department_id || null,
      vendor_id: form.vendor_id || null,
      article_description: description,
      cost_price: roundMoney(costPrice),
      quantity: Math.trunc(quantity),
      urgency: form.urgency,
      status_code: form.status_code || null,
      request_date: form.request_date || null,
    }

    try {
      const supabase = createClient()

      const runSave = async (body: Record<string, unknown>) =>
        dialog.mode === 'edit'
          ? supabase.from('article_requests').update(body).eq('id', dialog.row.id)
          : supabase.from('article_requests').insert(body)

      let result = await runSave({ ...payload, contact_id: form.contact_id || null })

      if (result.error && isMissingColumnError(result.error)) {
        const { contact_id: _contactId, ...withoutContact } = {
          ...payload,
          contact_id: form.contact_id || null,
        }
        result = await runSave(withoutContact)
      }

      if (result.error) {
        throw result.error
      }

      setDialog(null)
      setNotice({
        tone: 'success',
        message:
          dialog.mode === 'edit'
            ? `“${description}” was updated.`
            : `“${description}” was added.`,
      })
      await loadData({ silent: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'Unable to save the article request.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(row: ArticleRow, nextStatus: string) {
    if (!hasSupabaseEnv()) {
      setNotice({ tone: 'error', message: SUPABASE_SETUP_MESSAGE })
      return
    }

    const previous = row.status_code
    setStatusSavingId(row.id)
    setArticles((current) =>
      current.map((article) =>
        article.id === row.id ? { ...article, status_code: nextStatus || null } : article
      )
    )

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('article_requests')
        .update({ status_code: nextStatus || null })
        .eq('id', row.id)

      if (error) {
        throw error
      }

      setNotice({
        tone: 'success',
        message: `Status updated to ${statusLabels.get(nextStatus) ?? nextStatus}.`,
      })
    } catch (error) {
      setArticles((current) =>
        current.map((article) =>
          article.id === row.id ? { ...article, status_code: previous } : article
        )
      )
      setNotice({
        tone: 'error',
        message: getErrorMessage(error, 'Unable to update the status.'),
      })
    } finally {
      setStatusSavingId(null)
    }
  }

  async function handleBatchImported(result: Extract<ImportResult, { ok: true }>) {
    const count = result.imported.length
    const parts = [
      `${count} article request${count === 1 ? '' : 's'} imported${
        result.batchTag ? ` as “${result.batchTag}”` : ''
      }.`,
    ]

    if (result.vendorsCreated.length > 0) {
      parts.push(
        `Created ${result.vendorsCreated.length} vendor${
          result.vendorsCreated.length === 1 ? '' : 's'
        }.`
      )
    }

    if (result.skipped.length > 0) {
      parts.push(
        `Skipped ${result.skipped.length} row${result.skipped.length === 1 ? '' : 's'} without an article title.`
      )
    }

    setNotice({ tone: 'success', message: parts.join(' ') })
    await loadData({ silent: true })
  }

  async function handleDelete() {
    if (!deleteTarget) {
      return
    }

    if (!hasSupabaseEnv()) {
      setDeleteError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setDeleting(true)
    setDeleteError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.from('article_requests').delete().eq('id', deleteTarget.id)

      if (error) {
        throw error
      }

      setNotice({ tone: 'success', message: 'Article request deleted.' })
      setDeleteTarget(null)
      setSelectedIds((current) => {
        const next = new Set(current)
        next.delete(deleteTarget.id)
        return next
      })
      await loadData({ silent: true })
    } catch (error) {
      setDeleteError(getErrorMessage(error, 'Unable to delete the article request.'))
    } finally {
      setDeleting(false)
    }
  }

  function renderArticleRow(article: ArticleRow) {
    const urgency = normalizeUrgency(article.urgency)
    const cost = unitCost(article)
    const quantity = unitQuantity(article)
    const selected = selectedIds.has(article.id)
    const canBill = !article.tax_invoice_id && !article.proforma_invoice_id
    const batchLabel = displayBatch(article)
    const displayStatus = articleStatuses.get(article.id) ?? ''
    const isLinked = Boolean(article.proforma_invoice_id || article.tax_invoice_id)
    const proforma = article.proforma_invoice_id
      ? proformaMap.get(article.proforma_invoice_id)
      : undefined
    const taxInvoice = article.tax_invoice_id ? taxMap.get(article.tax_invoice_id) : undefined

    return (
      <tr
        key={article.id}
        className={selected ? 'bg-brand-50/50' : 'transition-colors hover:bg-slate-50/70'}
      >
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected}
            disabled={!canBill}
            onChange={() => toggleRow(article.id)}
            aria-label={`Select ${displayDescription(article)}`}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
          {formatDate(article.request_date ?? article.created_at)}
        </td>
        <td className="px-3 py-3 font-medium text-slate-900">
          {article.client_id ? clientNames.get(article.client_id) ?? 'Unknown client' : '—'}
        </td>
        <td className="px-3 py-3 text-slate-600">
          {article.department_id ? departmentNames.get(article.department_id) ?? '—' : '—'}
        </td>
        <td className="px-3 py-3 text-slate-600">
          {article.contact_id ? contactNames.get(article.contact_id) ?? '—' : '—'}
        </td>
        <td className="px-3 py-3">
          {batchLabel ? (
            <span
              className="inline-flex max-w-40 items-center truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"
              title={batchLabel}
            >
              {batchLabel}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="max-w-[18rem] px-3 py-3">
          <p className="truncate font-medium text-slate-900" title={displayDescription(article)}>
            {displayDescription(article)}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {article.proforma_invoice_id && (
              <span
                className="inline-flex items-center rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-700"
                title="Proforma invoice"
              >
                {proforma?.pi_number?.trim() || 'PI linked'}
              </span>
            )}
            {article.tax_invoice_id && (
              <span
                className="inline-flex items-center rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-700"
                title="Tax invoice"
              >
                {taxInvoice?.tax_invoice_number?.trim() || 'TI linked'}
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-slate-600">
          {article.vendor_id ? vendorNames.get(article.vendor_id) ?? '—' : '—'}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-slate-600">
          {formatCurrency(cost)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums text-slate-600">{quantity}</td>
        <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">
          {formatCurrency(roundMoney(cost * quantity))}
        </td>
        <td className="px-3 py-3">
          <span className={`${badgeClass} ${URGENCY_TONES[urgency] ?? URGENCY_TONES.MEDIUM}`}>
            {titleCase(urgency)}
          </span>
        </td>
        <td className="px-3 py-3">
          {isLinked ? (
            <span
              className={`${badgeClass} ${
                STATUS_TONES[displayStatus] ?? 'bg-slate-100 text-slate-600 ring-slate-500/20'
              }`}
              title="Status follows the linked invoice"
            >
              {displayStatus ? titleCase(displayStatus) : '—'}
            </span>
          ) : (
            <div className="relative">
              <select
                value={article.status_code ?? ''}
                onChange={(event) => void handleStatusChange(article, event.target.value)}
                disabled={statusSavingId === article.id}
                aria-label={`Change status for ${displayDescription(article)}`}
                className={`w-full min-w-36 cursor-pointer appearance-none rounded-full border-0 py-1 pl-2.5 pr-7 text-xs font-semibold outline-none ring-1 ring-inset focus:ring-2 focus:ring-brand-500 disabled:opacity-60 ${
                  STATUS_TONES[article.status_code ?? ''] ??
                  'bg-slate-100 text-slate-600 ring-slate-500/20'
                }`}
              >
                <option value="">Unassigned</option>
                {statuses.map((status) => (
                  <option key={status.status_code} value={status.status_code}>
                    {status.status_label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] opacity-70">
                ▾
              </span>
            </div>
          )}
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-end gap-1">
            <IconButton
              label={`Edit ${displayDescription(article)}`}
              tooltipText="Edit request"
              tooltip="native"
              variant="ghost"
              size="sm"
              icon={<Pencil />}
              onClick={() => openEditDialog(article)}
            />
            <IconButton
              label={`Delete ${displayDescription(article)}`}
              tooltipText="Delete request"
              tooltip="native"
              variant="danger"
              size="sm"
              icon={<Trash2 />}
              onClick={() => {
                setDeleteError(null)
                setDeleteTarget(article)
              }}
            />
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Article Requests
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Capture every request, track its lifecycle status and group unbilled items into a
            proforma invoice.
          </p>
        </div>

        <div className="flex items-center gap-2" role="toolbar" aria-label="Article request actions">
          <IconButton
            label="Manage batches"
            icon={<Layers />}
            onClick={() => setBatchManageOpen(true)}
          />
          <IconButton
            label="Import article batch"
            icon={<Upload />}
            onClick={() => setImportOpen(true)}
          />
          <IconButton
            label={exporting ? 'Exporting…' : 'Export filtered list'}
            icon={exporting ? <SpinnerIcon /> : <Download />}
            onClick={() => void handleExport()}
            disabled={exporting || filteredArticles.length === 0}
          />
          <IconButton
            label="New article request"
            icon={<Plus />}
            variant="primary"
            onClick={openCreateDialog}
          />
        </div>
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.message}
        </Alert>
      )}

      <div className={`overflow-hidden ${cardClass}`}>
        <div className="space-y-3 border-b border-slate-200 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search article, client, vendor or contact"
                aria-label="Search article requests"
                className={`${inputClass} pl-9`}
              />
            </div>

            <div className="flex items-center justify-between gap-3 lg:justify-end">
              <p className="text-xs text-slate-500">
                {filteredArticles.length} of {articles.length}{' '}
                {articles.length === 1 ? 'request' : 'requests'}
              </p>
              <button
                type="button"
                onClick={() => setGrouped((value) => !value)}
                aria-pressed={grouped}
                className={`${secondaryButtonClass} px-2.5 py-1.5`}
                title={grouped ? 'Show a flat list' : 'Group by client and department'}
              >
                <Layers className="h-4 w-4" />
                <span className="hidden sm:inline">{grouped ? 'Grouped' : 'Flat'}</span>
              </button>
              <button
                type="button"
                onClick={() => void loadData()}
                disabled={loading}
                className={`${secondaryButtonClass} px-2.5 py-1.5`}
              >
                {loading ? <SpinnerIcon className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <FilterSelect label="Client" value={clientFilter} onChange={setClientFilter}>
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company_name}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Department" value={departmentFilter} onChange={setDepartmentFilter}>
              <option value="">All departments</option>
              {filterDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.department_name}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Vendor" value={vendorFilter} onChange={setVendorFilter}>
              <option value="">All vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.vendor_name}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Urgency" value={urgencyFilter} onChange={setUrgencyFilter}>
              <option value="">All urgency</option>
              {URGENCIES.map((urgency) => (
                <option key={urgency} value={urgency}>
                  {titleCase(urgency)}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}>
              <option value="">All statuses</option>
              {statuses.map((status) => (
                <option key={status.status_code} value={status.status_code}>
                  {status.status_label}
                </option>
              ))}
            </FilterSelect>

            <FilterSelect
              label="Billing"
              value={billingFilter}
              onChange={(value) =>
                setBillingFilter(value === 'pending' || value === 'billed' ? value : '')
              }
            >
              <option value="">Pending and billed</option>
              <option value="pending">Pending billing</option>
              <option value="billed">Billed (on PI or tax invoice)</option>
            </FilterSelect>

            <label className="block">
              <span className="sr-only">Requested from</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => setDateFrom(event.target.value)}
                aria-label="Requested from date"
                title="Requested from"
                className={`${inputClass} py-1.5 text-xs`}
              />
            </label>

            <label className="block">
              <span className="sr-only">Requested to</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => setDateTo(event.target.value)}
                aria-label="Requested to date"
                title="Requested to"
                className={`${inputClass} py-1.5 text-xs`}
              />
            </label>
          </div>

          {(billingFilter || dateFrom || dateTo || statusFilter || clientFilter || departmentFilter) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              <span>Filters:</span>
              {statusFilter && (
                <FilterChip
                  label={`Status: ${
                    statuses.find((status) => status.status_code === statusFilter)?.status_label ??
                    statusFilter
                  }`}
                  onClear={() => setStatusFilter('')}
                />
              )}
              {clientFilter && (
                <FilterChip
                  label={`Client: ${clientNames.get(clientFilter) ?? 'Unknown'}`}
                  onClear={() => setClientFilter('')}
                />
              )}
              {departmentFilter && (
                <FilterChip
                  label={`Department: ${departmentNames.get(departmentFilter) ?? 'Unknown'}`}
                  onClear={() => setDepartmentFilter('')}
                />
              )}
              {billingFilter && (
                <FilterChip
                  label={billingFilter === 'pending' ? 'Pending billing' : 'Billed'}
                  onClear={() => setBillingFilter('')}
                />
              )}
              {(dateFrom || dateTo) && (
                <FilterChip
                  label={
                    dateFrom && dateTo && dateFrom === dateTo
                      ? `On ${formatDate(dateFrom)}`
                      : `${dateFrom ? formatDate(dateFrom) : 'Start'} – ${
                          dateTo ? formatDate(dateTo) : 'today'
                        }`
                  }
                  onClear={() => {
                    setDateFrom('')
                    setDateTo('')
                  }}
                />
              )}
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('')
                  setClientFilter('')
                  setDepartmentFilter('')
                  setBillingFilter('')
                  setDateFrom('')
                  setDateTo('')
                }}
                className="ml-1 font-medium text-brand-700 hover:underline"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {selectedArticles.length > 0 && (
          <div className="flex flex-col gap-2 border-b border-brand-200 bg-brand-50/60 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-brand-800">
              {selectedArticles.length} selected · {formatCurrency(assignSubtotal)} total cost
              {selectedClientIds.size > 1 && (
                <span className="ml-2 font-normal text-rose-600">
                  Select requests for a single client to create a proforma invoice.
                </span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className={`${secondaryButtonClass} px-2.5 py-1.5`}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setAssignOpen(true)}
                disabled={selectedClientIds.size !== 1}
                className={`${primaryButtonClass} px-3 py-1.5`}
              >
                <WalletCards className="h-4 w-4" />
                Add to proforma invoice
              </button>
            </div>
          </div>
        )}

        {loadError && articles.length > 0 && (
          <div className="border-b border-slate-200 px-4 py-3">
            <Alert tone="error" onDismiss={() => setLoadError(null)}>
              {loadError}
            </Alert>
          </div>
        )}

        {loading ? (
          <TableSkeleton />
        ) : loadError && articles.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-red-700">Could not load article requests</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-slate-500">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className={`${secondaryButtonClass} mt-4`}
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <FileText className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-900">
              {articles.length === 0 ? 'No article requests yet' : 'No matching requests'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {articles.length === 0
                ? 'Create the first request or import an Excel batch to capture incoming demand.'
                : 'Try a different search or clear the filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1350px] divide-y divide-slate-200 text-sm">
              <caption className="sr-only">Article requests</caption>
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      aria-label="Select all visible requests"
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Requested
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Client
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Department
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Contact
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Batch
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Article
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Vendor
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Cost
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Qty
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Total cost
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Urgency
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grouped
                  ? articleGroups.map((client) => (
                      <Fragment key={client.key}>
                        <tr className="bg-slate-100/80">
                          <td
                            colSpan={14}
                            className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
                          >
                            {client.clientLabel}
                          </td>
                        </tr>
                        {client.departments.map((department) => (
                          <Fragment key={department.key}>
                            <tr className="bg-slate-50">
                              <td
                                colSpan={14}
                                className="px-3 py-1.5 pl-8 text-xs font-medium text-slate-500"
                              >
                                {department.departmentLabel}
                              </td>
                            </tr>
                            {department.articles.map((article) => renderArticleRow(article))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))
                  : filteredArticles.map((article) => renderArticleRow(article))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={dialog !== null}
        onClose={() => {
          if (!saving) {
            setDialog(null)
            setFormError(null)
          }
        }}
        size="3xl"
        title={dialog?.mode === 'edit' ? 'Edit article request' : 'New article request'}
        description="Track the article, supplier cost and the lifecycle stage in one place."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="article-client" className={labelClass}>
                Client <span className="text-red-500">*</span>
              </label>
              <select
                id="article-client"
                value={form.client_id}
                onChange={(event) => handleClientChange(event.target.value)}
                required
                className={inputClass}
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.company_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="article-department" className={labelClass}>
                Department
              </label>
              <select
                id="article-department"
                value={form.department_id}
                onChange={(event) => updateForm('department_id', event.target.value)}
                disabled={!form.client_id || formDepartments.length === 0}
                className={inputClass}
              >
                <option value="">
                  {!form.client_id
                    ? 'Select a client first'
                    : formDepartments.length === 0
                      ? 'No departments for this client'
                      : 'No department'}
                </option>
                {formDepartments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.department_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="article-contact" className={labelClass}>
                Contact person
              </label>
              <select
                id="article-contact"
                value={form.contact_id}
                onChange={(event) => updateForm('contact_id', event.target.value)}
                disabled={!form.client_id || formContacts.length === 0}
                className={inputClass}
              >
                <option value="">
                  {!form.client_id
                    ? 'Select a client first'
                    : formContacts.length === 0
                      ? 'No contacts for this client'
                      : 'No contact'}
                </option>
                {formContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.contact_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="article-vendor" className={labelClass}>
                Vendor
              </label>
              <select
                id="article-vendor"
                value={form.vendor_id}
                onChange={(event) => updateForm('vendor_id', event.target.value)}
                className={inputClass}
              >
                <option value="">No vendor</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.vendor_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="article-description" className={labelClass}>
              Article description <span className="text-red-500">*</span>
            </label>
            <textarea
              id="article-description"
              value={form.article_description}
              onChange={(event) => updateForm('article_description', event.target.value)}
              required
              rows={2}
              maxLength={400}
              placeholder="e.g. Phase III clinical trial reprint — 50 copies"
              className={`${inputClass} resize-y`}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="article-cost" className={labelClass}>
                Cost price (₹)
              </label>
              <input
                id="article-cost"
                type="number"
                min={0}
                step="0.01"
                value={form.cost_price}
                onChange={(event) => updateForm('cost_price', event.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label htmlFor="article-quantity" className={labelClass}>
                Quantity
              </label>
              <input
                id="article-quantity"
                type="number"
                min={1}
                step={1}
                value={form.quantity}
                onChange={(event) => updateForm('quantity', event.target.value)}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label htmlFor="article-urgency" className={labelClass}>
                Urgency
              </label>
              <select
                id="article-urgency"
                value={form.urgency}
                onChange={(event) => updateForm('urgency', event.target.value)}
                className={inputClass}
              >
                {URGENCIES.map((urgency) => (
                  <option key={urgency} value={urgency}>
                    {titleCase(urgency)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="article-date" className={labelClass}>
                Request date
              </label>
              <input
                id="article-date"
                type="date"
                value={form.request_date}
                onChange={(event) => updateForm('request_date', event.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="article-status" className={labelClass}>
              Lifecycle status
            </label>
            <select
              id="article-status"
              value={form.status_code}
              onChange={(event) => updateForm('status_code', event.target.value)}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {statuses.map((status) => (
                <option key={status.status_code} value={status.status_code}>
                  {status.status_label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">Total cost</p>
            <p className="text-base font-semibold tabular-nums text-slate-900">
              {formatCurrency(
                roundMoney(
                  (Number.isFinite(Number(form.cost_price)) ? Number(form.cost_price) : 0) *
                    (Number.isFinite(Number(form.quantity)) ? Number(form.quantity) : 0)
                )
              )}
            </p>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setDialog(null)}
              disabled={saving}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving && <SpinnerIcon className="h-4 w-4" />}
              {saving ? 'Saving…' : dialog?.mode === 'edit' ? 'Save changes' : 'Add request'}
            </button>
          </div>
        </form>
      </Modal>

      <AssignProformaDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        clientId={assignClientId}
        clientName={assignClientId ? clientNames.get(assignClientId) ?? 'Client' : 'Client'}
        articles={selectedArticles.map((article) => ({
          id: article.id,
          description: displayDescription(article),
          amount: roundMoney(unitCost(article) * unitQuantity(article)),
        }))}
        onAssigned={async (message) => {
          setAssignOpen(false)
          setSelectedIds(new Set())
          setNotice({ tone: 'success', message })
          await loadData({ silent: true })
        }}
      />

      <BatchImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        clients={clients}
        departments={departments}
        contacts={contacts}
        onImported={handleBatchImported}
      />

      <BatchManageDialog
        open={batchManageOpen}
        onClose={() => setBatchManageOpen(false)}
        articles={articles}
        clientNames={clientNames}
        onUpdated={async (message) => {
          setNotice({ tone: 'success', message })
          await loadData({ silent: true })
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete “${deleteTarget ? displayDescription(deleteTarget) : 'article request'}”?`}
        message="This permanently removes the article request. Invoices that reference it may block the delete."
        busy={deleting}
        error={deleteError}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null)
            setDeleteError(null)
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Filter by ${label.toLowerCase()}`}
        className={`${inputClass} py-1.5 text-xs`}
      >
        {children}
      </select>
    </label>
  )
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear filter ${label}`}
        className="rounded-full p-0.5 text-brand-600 hover:bg-brand-100 hover:text-brand-800"
      >
        ×
      </button>
    </span>
  )
}

function displayDescription(article: ArticleRow): string {
  if (article.article_description?.trim()) {
    return article.article_description.trim()
  }

  return getArticleTitle(article as ArticleRequestRow)
}

function displayBatch(article: ArticleRow): string | null {
  const tag = getArticleBatchTag(article as ArticleRequestRow)

  if (tag) {
    return tag
  }

  const batchId = getArticleBatchId(article as ArticleRequestRow)

  return batchId ? `Batch ${batchId.slice(0, 8).toUpperCase()}` : null
}

function unitCost(article: ArticleRow): number {
  if (typeof article.cost_price === 'number' && Number.isFinite(article.cost_price)) {
    return article.cost_price
  }

  return getArticleRate(article as ArticleRequestRow)
}

function unitQuantity(article: ArticleRow): number {
  if (typeof article.quantity === 'number' && Number.isFinite(article.quantity) && article.quantity > 0) {
    return article.quantity
  }

  return 1
}

function compareLatestFirst(a: ArticleRow, b: ArticleRow): number {
  const compare = (left: string | null, right: string | null) => {
    const aValue = left ?? ''
    const bValue = right ?? ''

    if (aValue === bValue) {
      return 0
    }

    if (!aValue) {
      return 1
    }

    if (!bValue) {
      return -1
    }

    return aValue < bValue ? 1 : -1
  }

  return (
    compare(a.request_date, b.request_date) || compare(a.created_at, b.created_at)
  )
}

function normalizeUrgency(value: string | null | undefined): string {
  const normalized = (value ?? '').toUpperCase()

  return (URGENCIES as readonly string[]).includes(normalized) ? normalized : 'MEDIUM'
}

const TITLE_CASE_ACRONYMS = new Set(['PI', 'TI', 'GST'])

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => {
      const upper = part.toUpperCase()

      if (TITLE_CASE_ACRONYMS.has(upper)) {
        return upper
      }

      return part.slice(0, 1).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-100" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-4">
          <div className="h-4 w-4 animate-pulse rounded bg-slate-100" />
          <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="hidden h-4 w-32 animate-pulse rounded bg-slate-100 sm:block" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-slate-100 lg:block" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
