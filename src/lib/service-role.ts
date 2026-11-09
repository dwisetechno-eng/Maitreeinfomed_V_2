/**
 * Resolve the server-only Supabase service role key.
 *
 * Different Supabase/Vercel setups name this variable differently, so accept a
 * few common spellings. Values are trimmed and surrounding quotes are stripped
 * to survive copy/paste mistakes in environment dashboards.
 *
 * Never import this from a client component: the key must stay server-only.
 */

const SERVICE_ROLE_CANDIDATES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SUPABASE_SECRET_KEY',
] as const

const URL_CANDIDATES = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'] as const

function cleanEnvValue(value: string | undefined): string | null {
  if (!value) {
    return null
  }
  const trimmed = value.trim().replace(/^["']|["']$/g, '')
  return trimmed.length > 0 ? trimmed : null
}

export function getSupabaseUrl(): string | null {
  for (const name of URL_CANDIDATES) {
    const value = cleanEnvValue(process.env[name])
    if (value) {
      return value
    }
  }
  return null
}

export function getServiceRoleKey(): string | null {
  for (const name of SERVICE_ROLE_CANDIDATES) {
    const value = cleanEnvValue(process.env[name])
    if (value) {
      return value
    }
  }
  return null
}

export type ServiceRoleStatus = {
  urlConfigured: boolean
  /** Which known variable names are present. Never contains values. */
  keyFoundIn: string[]
  checkedNames: string[]
  /** True when a service role key was resolved and can be used. */
  available: boolean
  /** Vercel runtime identity, useful when debugging env mismatches. */
  environment: string | null
  branch: string | null
  commit: string | null
}

/** Safe diagnostics for the admin UI. Returns names, never secret values. */
export function getServiceRoleStatus(): ServiceRoleStatus {
  const keyFoundIn = SERVICE_ROLE_CANDIDATES.filter((name) =>
    Boolean(cleanEnvValue(process.env[name]))
  )

  return {
    urlConfigured: Boolean(getSupabaseUrl()),
    keyFoundIn: [...keyFoundIn],
    checkedNames: [...SERVICE_ROLE_CANDIDATES],
    available: keyFoundIn.length > 0 && Boolean(getSupabaseUrl()),
    environment: cleanEnvValue(process.env.VERCEL_ENV ?? process.env.NODE_ENV),
    branch: cleanEnvValue(process.env.VERCEL_GIT_COMMIT_REF),
    commit: cleanEnvValue(process.env.VERCEL_GIT_COMMIT_SHA)?.slice(0, 7) ?? null,
  }
}
