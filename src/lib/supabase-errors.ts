type PostgrestLikeError = {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

/**
 * Supabase reports unknown columns in two different ways depending on whether
 * the request hits the API schema cache or the database itself.
 */
export function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const { code, message } = error as PostgrestLikeError

  return (
    code === '42703' ||
    code === 'PGRST204' ||
    /column .* does not exist|could not find the '.*' column/i.test(message ?? '')
  )
}

/**
 * Extract the column name reported by a missing-column error, when present.
 * Used by writers that retry without optional columns on un-migrated databases.
 */
export function extractMissingColumnName(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const message = (error as PostgrestLikeError).message ?? ''
  const postgresMatch = /column\s+[^\s.]+\.([a-zA-Z0-9_]+)\s+does not exist/i.exec(message)

  if (postgresMatch) {
    return postgresMatch[1]
  }

  const cacheMatch = /could not find the '([^']+)' column/i.exec(message)

  return cacheMatch?.[1] ?? null
}

/**
 * Supabase reports unknown tables through the schema cache (`PGRST205`) while
 * Postgres itself uses `42P01`. Optional tables such as `payment_allocations`
 * are probed at runtime so the UI can degrade gracefully before migrations run.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const { code, message } = error as PostgrestLikeError

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /could not find the table|relation .* does not exist/i.test(message ?? '')
  )
}
