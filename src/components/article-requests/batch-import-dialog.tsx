'use client'

import type { DragEvent } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { importArticleBatch, type ImportResult } from '@/actions/import-articles'
import {
  SUPABASE_SETUP_MESSAGE,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { SpinnerIcon, UploadIcon } from '@/components/ui/icons'
import { Modal } from '@/components/ui/modal'

type ClientOption = { id: string; company_name: string }
type DepartmentOption = { id: string; department_name: string; client_id: string | null }
type ContactOption = { id: string; client_id: string | null; contact_name: string }

type ImportedBatch = Extract<ImportResult, { ok: true }>

type Props = {
  open: boolean
  onClose: () => void
  clients: ClientOption[]
  departments: DepartmentOption[]
  contacts: ContactOption[]
  onImported: (result: ImportedBatch) => void | Promise<void>
}

const MAX_FILE_BYTES = 8 * 1024 * 1024

export function BatchImportDialog({
  open,
  onClose,
  clients,
  departments,
  contacts,
  onImported,
}: Props) {
  const [clientId, setClientId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [contactId, setContactId] = useState('')
  const [batchTag, setBatchTag] = useState('')

  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    setClientId('')
    setDepartmentId('')
    setContactId('')
    setBatchTag('')
    setFile(null)
    setDragging(false)
    setError(null)
  }, [open])

  const clientDepartments = useMemo(
    () => (clientId ? departments.filter((item) => item.client_id === clientId) : []),
    [clientId, departments]
  )

  const clientContacts = useMemo(
    () => (clientId ? contacts.filter((item) => item.client_id === clientId) : []),
    [clientId, contacts]
  )

  const closeDialog = useCallback(() => {
    if (!importing) {
      onClose()
    }
  }, [importing, onClose])

  function handleClientChange(nextClientId: string) {
    setClientId(nextClientId)
    setDepartmentId('')
    setContactId('')
    setError(null)
  }

  function selectFile(nextFile: File | null) {
    if (!nextFile) {
      setFile(null)
      return
    }

    if (!/\.(xlsx|xlsm)$/i.test(nextFile.name)) {
      setError('Only .xlsx or .xlsm files are supported.')
      return
    }

    if (nextFile.size === 0) {
      setError('The selected file is empty.')
      return
    }

    if (nextFile.size > MAX_FILE_BYTES) {
      setError('The file is larger than 8 MB. Split it into smaller imports.')
      return
    }

    setError(null)
    setFile(nextFile)
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)

    if (importing) {
      return
    }

    selectFile(event.dataTransfer.files?.[0] ?? null)
  }

  async function handleImport() {
    if (!clientId) {
      setError('Select a client before importing a batch.')
      return
    }

    if (!file) {
      setError('Choose an .xlsx file to import.')
      return
    }

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      return
    }

    setImporting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('clientId', clientId)
      if (departmentId) {
        formData.append('departmentId', departmentId)
      }
      if (contactId) {
        formData.append('contactId', contactId)
      }
      if (batchTag.trim()) {
        formData.append('batchTag', batchTag.trim())
      }

      const result = await importArticleBatch(formData)

      if (!result.ok) {
        setError(result.error)
        return
      }

      await onImported(result)
      onClose()
    } catch (importError) {
      setError(
        getErrorMessage(
          importError,
          'The workbook could not be uploaded. Check your connection and retry.'
        )
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeDialog}
      size="2xl"
      title="Import article batch"
      description="Upload a spreadsheet to capture incoming demand before it is billed."
      footer={
        <div className="space-y-3">
          {error && (
            <Alert tone="error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Every row in this run shares one batch, making it easy to invoice later.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                onClick={closeDialog}
                disabled={importing}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={importing || !clientId || !file}
                className={primaryButtonClass}
              >
                {importing ? (
                  <SpinnerIcon className="h-4 w-4" />
                ) : (
                  <UploadIcon className="h-4 w-4" />
                )}
                {importing ? 'Importing…' : 'Import batch'}
              </button>
            </div>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="batch-client" className={labelClass}>
              Client <span className="text-red-500">*</span>
            </label>
            <select
              id="batch-client"
              value={clientId}
              onChange={(event) => handleClientChange(event.target.value)}
              disabled={importing}
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
            <label htmlFor="batch-department" className={labelClass}>
              Department
            </label>
            <select
              id="batch-department"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={!clientId || importing || clientDepartments.length === 0}
              className={inputClass}
            >
              <option value="">
                {!clientId
                  ? 'Select a client first'
                  : clientDepartments.length === 0
                    ? 'No departments for this client'
                    : 'No department'}
              </option>
              {clientDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.department_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="batch-contact" className={labelClass}>
              Contact person
            </label>
            <select
              id="batch-contact"
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
              disabled={!clientId || importing || clientContacts.length === 0}
              className={inputClass}
            >
              <option value="">
                {!clientId
                  ? 'Select a client first'
                  : clientContacts.length === 0
                    ? 'No contacts for this client'
                    : 'No contact'}
              </option>
              {clientContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.contact_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="batch-tag" className={labelClass}>
              Batch tag / reference
            </label>
            <input
              id="batch-tag"
              type="text"
              value={batchTag}
              onChange={(event) => setBatchTag(event.target.value)}
              disabled={importing}
              maxLength={120}
              placeholder="e.g. Nov 2026 Batch A"
              className={inputClass}
            />
          </div>
        </div>

        <label
          htmlFor="batch-file"
          onDragOver={(event) => {
            event.preventDefault()
            if (!importing) {
              setDragging(true)
            }
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            importing
              ? 'cursor-wait border-slate-200 bg-slate-50'
              : dragging
                ? 'border-brand-500 bg-brand-50'
                : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/40'
          }`}
          aria-disabled={importing}
        >
          <input
            id="batch-file"
            type="file"
            accept=".xlsx,.xlsm"
            className="sr-only"
            disabled={importing}
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          />

          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            {importing ? (
              <SpinnerIcon className="h-5 w-5" />
            ) : (
              <UploadIcon className="h-5 w-5" />
            )}
          </span>

          <span className="text-sm font-medium text-slate-900">
            {importing
              ? 'Importing articles…'
              : file
                ? file.name
                : 'Drop your .xlsx file here, or click to browse'}
          </span>

          <span className="text-xs text-slate-500">
            One worksheet per file · up to 8 MB
          </span>
        </label>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
          <p className="font-medium text-slate-700">Expected columns</p>
          <p className="mt-1">
            <span className="font-medium text-slate-800">Article</span> (required),{' '}
            <span className="font-medium text-slate-800">Vendor</span>,{' '}
            <span className="font-medium text-slate-800">Quantity</span>,{' '}
            <span className="font-medium text-slate-800">Rate</span>,{' '}
            <span className="font-medium text-slate-800">Request date</span>,{' '}
            <span className="font-medium text-slate-800">Remarks</span>. Headers are matched
            case-insensitively, and common aliases such as “Title”, “Qty”, “Price” and “Notes”
            work too. Unknown vendors are created automatically.
          </p>
        </div>
      </div>
    </Modal>
  )
}
