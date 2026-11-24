export type SortDirection = 'asc' | 'desc'

export type TableSort<K extends string = string> = {
  key: K
  direction: SortDirection
} | null

export type SortableValue = string | number | null | undefined

export type RowAccessors<T, K extends string> = Record<K, (row: T) => SortableValue>

/** Flip the direction when the active column is clicked again. */
export function nextTableSort<K extends string>(
  current: TableSort<K>,
  key: K,
  defaultDirection: SortDirection = 'asc'
): TableSort<K> {
  if (!current || current.key !== key) {
    return { key, direction: defaultDirection }
  }

  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

function isEmpty(value: SortableValue): boolean {
  return value == null || value === ''
}

/** Sort a copy of the rows; empty values always stay at the end. */
export function sortTableRows<T, K extends string>(
  rows: T[],
  sort: TableSort<K>,
  accessors: RowAccessors<T, K>,
  fallback?: (a: T, b: T) => number
): T[] {
  const sorted = [...rows]

  if (!sort) {
    return fallback ? sorted.sort(fallback) : sorted
  }

  const getValue = accessors[sort.key]
  const factor = sort.direction === 'asc' ? 1 : -1

  return sorted.sort((a, b) => {
    const left = getValue(a)
    const right = getValue(b)
    const leftEmpty = isEmpty(left)
    const rightEmpty = isEmpty(right)

    if (leftEmpty || rightEmpty) {
      if (leftEmpty && rightEmpty) {
        return fallback ? fallback(a, b) : 0
      }

      return leftEmpty ? 1 : -1
    }

    const comparison =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), undefined, {
            numeric: true,
            sensitivity: 'base',
          })

    if (comparison !== 0) {
      return comparison * factor
    }

    return fallback ? fallback(a, b) : 0
  })
}
