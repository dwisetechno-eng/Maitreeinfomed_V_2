/**
 * Batch serial numbers for article requests.
 *
 * Imported rows may already carry a "Sr No"; blank ones are numbered in row
 * order using the lowest numbers the sheet did not already use.
 */

type SrNoRow = { srNo: number | null }

export function assignMissingSrNumbers<T extends SrNoRow>(rows: T[]): void {
  const used = new Set<number>()

  for (const row of rows) {
    if (row.srNo != null) {
      used.add(row.srNo)
    }
  }

  let next = 1

  for (const row of rows) {
    if (row.srNo != null) {
      continue
    }

    while (used.has(next)) {
      next += 1
    }

    row.srNo = next
    used.add(next)
  }
}
