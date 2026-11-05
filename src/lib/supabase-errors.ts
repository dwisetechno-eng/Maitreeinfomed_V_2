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
