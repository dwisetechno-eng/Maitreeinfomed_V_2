import { describe, expect, it } from 'vitest'

import {
  MULTIPLE_DEPARTMENTS_KEY,
  NO_CLIENT_KEY,
  NO_DEPARTMENT_KEY,
  groupInvoicesByClientAndDepartment,
  invoiceDepartmentRef,
  resolveTaxInvoiceDepartments,
  type ProformaDepartmentLink,
} from '@/lib/invoice-grouping'

const clientNames = new Map([
  ['c1', 'Alpha Labs'],
  ['c2', 'Beta Pharma'],
])

const departmentNames = new Map([
  ['d1', 'Cardiology'],
  ['d2', 'Neurology'],
  ['d3', 'Oncology'],
])

type Row = { id: string; client: string | null; department: string | null }

const rows: Row[] = [
  { id: 'a', client: 'c2', department: 'd1' },
  { id: 'b', client: 'c1', department: 'd2' },
  { id: 'c', client: 'c1', department: 'd1' },
  { id: 'd', client: null, department: null },
]

function group(list: Row[]) {
  return groupInvoicesByClientAndDepartment(list, {
    getClientId: (row) => row.client,
    getDepartment: (row) => invoiceDepartmentRef(row.department, departmentNames),
    clientNames,
  })
}

describe('groupInvoicesByClientAndDepartment', () => {
  it('groups by client then department with counts', () => {
    const groups = group(rows)

    expect(groups.map((item) => item.clientLabel)).toEqual([
      'Alpha Labs',
      'Beta Pharma',
      'No client',
    ])
    expect(groups[0].invoiceCount).toBe(2)
    expect(groups[0].departments.map((item) => item.department.label)).toEqual([
      'Cardiology',
      'Neurology',
    ])
    expect(groups[0].departments[0].invoiceCount).toBe(1)
    expect(groups[2].key).toBe(NO_CLIENT_KEY)
    expect(groups[2].departments[0].department.key).toBe(NO_DEPARTMENT_KEY)
  })

  it('keeps unknown labels readable', () => {
    const groups = group([{ id: 'x', client: 'c9', department: 'd9' }])

    expect(groups[0].clientLabel).toBe('Unknown client')
    expect(groups[0].departments[0].department.label).toBe('Unknown department')
  })
})

const links: ProformaDepartmentLink[] = [
  { id: 'p1', tax_invoice_id: 't1', department_id: 'd1' },
  { id: 'p2', tax_invoice_id: 't1', department_id: 'd1' },
  { id: 'p3', tax_invoice_id: 't2', department_id: 'd1' },
  { id: 'p4', tax_invoice_id: 't2', department_id: 'd2' },
  { id: 'p5', tax_invoice_id: null, department_id: 'd3' },
]

describe('resolveTaxInvoiceDepartments', () => {
  it('resolves a single department from native proforma links', () => {
    const resolved = resolveTaxInvoiceDepartments(
      [{ id: 't1' }],
      links,
      departmentNames
    )

    expect(resolved.get('t1')).toEqual({
      key: 'd1',
      label: 'Cardiology',
      ids: ['d1'],
    })
  })

  it('flags tax invoices spanning several departments', () => {
    const resolved = resolveTaxInvoiceDepartments(
      [{ id: 't2' }],
      links,
      departmentNames
    )

    expect(resolved.get('t2')).toMatchObject({
      key: MULTIPLE_DEPARTMENTS_KEY,
      label: 'Multiple departments',
    })
    expect(new Set(resolved.get('t2')?.ids)).toEqual(new Set(['d1', 'd2']))
  })

  it('falls back to the legacy document_content proforma ids', () => {
    const resolved = resolveTaxInvoiceDepartments(
      [
        {
          id: 't3',
          document_content: JSON.stringify({
            source: 'PROFORMA',
            proforma_invoice_ids: ['p5'],
          }),
        },
      ],
      links,
      departmentNames
    )

    expect(resolved.get('t3')).toMatchObject({ key: 'd3', label: 'Oncology' })
  })

  it('uses the no-department bucket when nothing can be resolved', () => {
    const resolved = resolveTaxInvoiceDepartments([{ id: 't4' }], links, departmentNames)

    expect(resolved.get('t4')).toMatchObject({
      key: NO_DEPARTMENT_KEY,
      label: 'No department',
      ids: [],
    })
  })
})
