/**
 * Shared helpers for the invoice list screens: cluster rows by client and
 * department, and derive a department for tax invoices from their linked
 * proforma invoices.
 */

import { parseLinkedProformaIds } from '@/lib/tax-invoices'

export const NO_CLIENT_KEY = '__no_client__'
export const NO_DEPARTMENT_KEY = '__no_department__'
export const MULTIPLE_DEPARTMENTS_KEY = '__multiple_departments__'

export type DepartmentOption = {
  id: string
  department_name: string
  client_id: string | null
}

export type InvoiceDepartmentRef = {
  /** Stable grouping key; may be one of the `NO_*` / `MULTIPLE_*` sentinels. */
  key: string
  label: string
  /** Department ids the invoice covers; empty when the department is unknown. */
  ids: string[]
}

export type InvoiceDepartmentGroup<T> = {
  key: string
  department: InvoiceDepartmentRef
  invoices: T[]
  invoiceCount: number
}

export type InvoiceClientGroup<T> = {
  key: string
  clientLabel: string
  departments: InvoiceDepartmentGroup<T>[]
  invoiceCount: number
}

/** Department descriptor for a row that carries a single (or no) department. */
export function invoiceDepartmentRef(
  departmentId: string | null | undefined,
  departmentNames: Map<string, string>
): InvoiceDepartmentRef {
  if (!departmentId) {
    return { key: NO_DEPARTMENT_KEY, label: 'No department', ids: [] }
  }

  return {
    key: departmentId,
    label: departmentNames.get(departmentId) ?? 'Unknown department',
    ids: [departmentId],
  }
}

/**
 * Build a client → department → invoices tree. Rows without a client or
 * department fall into an "No client" / "No department" bucket that sorts
 * last, so the named groups stay at the top of the table.
 */
export function groupInvoicesByClientAndDepartment<T>(
  invoices: T[],
  options: {
    getClientId: (invoice: T) => string | null | undefined
    getDepartment: (invoice: T) => InvoiceDepartmentRef
    clientNames: Map<string, string>
  }
): InvoiceClientGroup<T>[] {
  const clientMap = new Map<
    string,
    {
      key: string
      clientLabel: string
      departments: Map<string, InvoiceDepartmentGroup<T>>
    }
  >()

  for (const invoice of invoices) {
    const clientId = options.getClientId(invoice) || null
    const clientKey = clientId ?? NO_CLIENT_KEY
    const clientLabel = clientId
      ? options.clientNames.get(clientId) ?? 'Unknown client'
      : 'No client'

    let client = clientMap.get(clientKey)

    if (!client) {
      client = { key: clientKey, clientLabel, departments: new Map() }
      clientMap.set(clientKey, client)
    }

    const department = options.getDepartment(invoice)
    let group = client.departments.get(department.key)

    if (!group) {
      group = {
        key: `${clientKey}:${department.key}`,
        department,
        invoices: [],
        invoiceCount: 0,
      }
      client.departments.set(department.key, group)
    }

    group.invoices.push(invoice)
    group.invoiceCount += 1
  }

  return [...clientMap.values()]
    .sort((a, b) => {
      const rank = sentinelRank(a.key, NO_CLIENT_KEY) - sentinelRank(b.key, NO_CLIENT_KEY)
      return rank !== 0 ? rank : a.clientLabel.localeCompare(b.clientLabel)
    })
    .map((client) => {
      const departments = [...client.departments.values()].sort((a, b) => {
        const rank =
          departmentRank(a.department) - departmentRank(b.department)
        return rank !== 0 ? rank : a.department.label.localeCompare(b.department.label)
      })

      return {
        key: client.key,
        clientLabel: client.clientLabel,
        departments,
        invoiceCount: departments.reduce((sum, department) => sum + department.invoiceCount, 0),
      }
    })
}

function sentinelRank(key: string, sentinel: string): number {
  return key === sentinel ? 1 : 0
}

function departmentRank(department: InvoiceDepartmentRef): number {
  if (department.key === NO_DEPARTMENT_KEY) {
    return 2
  }

  if (department.key === MULTIPLE_DEPARTMENTS_KEY) {
    return 1
  }

  return 0
}

export type ProformaDepartmentLink = {
  id: string
  tax_invoice_id: string | null
  department_id: string | null
}

/**
 * Tax invoices have no department column. Resolve one from the proforma
 * invoices linked to them (native `tax_invoice_id` first, then the legacy ids
 * stored in `document_content`). Invoices spanning several departments get a
 * "Multiple departments" group so the label is never misleading.
 */
export function resolveTaxInvoiceDepartments(
  invoices: Array<{ id: string; document_content?: string | null }>,
  links: ProformaDepartmentLink[],
  departmentNames: Map<string, string>
): Map<string, InvoiceDepartmentRef> {
  const byTaxInvoice = new Map<string, Set<string>>()
  const byProforma = new Map<string, string>()

  for (const link of links) {
    if (!link.department_id) {
      continue
    }

    byProforma.set(link.id, link.department_id)

    if (!link.tax_invoice_id) {
      continue
    }

    const ids = byTaxInvoice.get(link.tax_invoice_id) ?? new Set<string>()
    ids.add(link.department_id)
    byTaxInvoice.set(link.tax_invoice_id, ids)
  }

  const resolved = new Map<string, InvoiceDepartmentRef>()

  for (const invoice of invoices) {
    let ids = byTaxInvoice.get(invoice.id)

    if (!ids || ids.size === 0) {
      const legacy = new Set<string>()

      for (const proformaId of parseLinkedProformaIds(invoice.document_content)) {
        const departmentId = byProforma.get(proformaId)

        if (departmentId) {
          legacy.add(departmentId)
        }
      }

      ids = legacy
    }

    if (ids.size === 0) {
      resolved.set(invoice.id, invoiceDepartmentRef(null, departmentNames))
      continue
    }

    if (ids.size === 1) {
      const [departmentId] = ids
      resolved.set(invoice.id, {
        key: departmentId,
        label: departmentNames.get(departmentId) ?? 'Unknown department',
        ids: [departmentId],
      })
      continue
    }

    resolved.set(invoice.id, {
      key: MULTIPLE_DEPARTMENTS_KEY,
      label: 'Multiple departments',
      ids: [...ids],
    })
  }

  return resolved
}
