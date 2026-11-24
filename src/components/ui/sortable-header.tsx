'use client'

import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import type { SortDirection, TableSort } from '@/lib/table-sort'

type SortableHeaderProps<K extends string> = {
  label: string
  column: K
  sort: TableSort<K>
  onSort: (column: K) => void
  align?: 'left' | 'right'
  className?: string
}

export function SortableHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  align = 'left',
  className = 'px-4 py-3',
}: SortableHeaderProps<K>) {
  const active = sort?.key === column
  const direction: SortDirection | null = active ? sort.direction : null

  return (
    <th
      scope="col"
      aria-sort={
        direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'
      }
      className={`${align === 'right' ? 'text-right' : ''} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={`Sort by ${label}`}
        className={`group inline-flex w-full items-center gap-1 rounded transition-colors hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
          align === 'right' ? 'justify-end' : ''
        }`}
      >
        <span>{label}</span>
        {direction === 'asc' ? (
          <ArrowUp className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
        ) : direction === 'desc' ? (
          <ArrowDown className="h-3.5 w-3.5 text-brand-600" aria-hidden="true" />
        ) : (
          <ChevronsUpDown
            className="h-3.5 w-3.5 text-slate-300 transition group-hover:text-slate-500"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  )
}
