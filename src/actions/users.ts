'use server'

/**
 * Server actions for the user-management control panel.
 *
 * Creating, updating and deleting Supabase Auth users requires the service role
 * key, so these actions degrade gracefully (and report a clear error) when
 * `SUPABASE_SERVICE_ROLE_KEY` is not configured. Profile rows are still
 * readable/writable through the publishable client under the RLS policies in
 * `20261108150000_profiles_rbac.sql`.
 */

import { createClient as createServerClient } from '@/utils/supabase/server'
import { createClient as createBrowserClient } from '@supabase/supabase-js'

export type AppUserRow = {
  id: string
  email: string | null
  fullName: string | null
  role: string
  createdAt: string | null
}

export type UserActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return null
  }
  return createBrowserClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function getCurrentUserRole(): Promise<string | null> {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return null
    }

    // 1) Prefer the role stored in the profiles table (RBAC).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const profileRole = (profile as { role?: string | null } | null)?.role
    if (profileRole) {
      return profileRole.trim().toLowerCase()
    }

    // 2) Fall back to app_metadata / user_metadata so a promoted user can
    //    still get in even if the profiles row is missing or blocked by RLS.
    const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>
    const userMetadata = (user.user_metadata ?? {}) as Record<string, unknown>
    const metaRole =
      (typeof appMetadata.role === 'string' && appMetadata.role) ||
      (typeof userMetadata.role === 'string' && userMetadata.role) ||
      null
    return metaRole ? metaRole.trim().toLowerCase() : null
  } catch {
    return null
  }
}

export async function listAppUsers(): Promise<
  { ok: true; users: AppUserRow[] } | { ok: false; error: string }
> {
  const role = await getCurrentUserRole()
  if (role !== 'admin') {
    return {
      ok: false,
      error: `Only administrators can manage users (detected role: ${role ?? 'none'}).`,
    }
  }

  const admin = getAdminClient()
  const client = admin ?? (await createServerClient())

  const { data, error } = await client
    .from('profiles')
    .select('id, email, full_name, role, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    return { ok: false, error: error.message }
  }

  const users: AppUserRow[] = (data ?? []).map((row) => {
    const r = row as {
      id: string
      email: string | null
      full_name: string | null
      role: string | null
      created_at: string | null
    }
    return {
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      role: r.role ?? 'user',
      createdAt: r.created_at,
    }
  })

  return { ok: true, users }
}

export async function createAppUser(input: {
  email: string
  password: string
  fullName: string
  role: string
}): Promise<UserActionResult> {
  const role = await getCurrentUserRole()
  if (role !== 'admin') {
    return { ok: false, error: 'Only administrators can create users.' }
  }

  const admin = getAdminClient()
  if (!admin) {
    return {
      ok: false,
      error:
        'User creation requires SUPABASE_SERVICE_ROLE_KEY to be configured on the server.',
    }
  }

  const email = input.email.trim()
  const password = input.password
  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' }
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim() || email },
    app_metadata: { role: input.role },
  })

  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Unable to create the user.' }
  }

  // Keep the profile row in sync (trigger may have already created it).
  await admin
    .from('profiles')
    .upsert({
      id: data.user.id,
      email,
      full_name: input.fullName.trim() || email,
      role: input.role,
    })

  return { ok: true, message: `User ${email} was created.` }
}

export async function updateAppUser(input: {
  id: string
  fullName: string
  role: string
}): Promise<UserActionResult> {
  const role = await getCurrentUserRole()
  if (role !== 'admin') {
    return { ok: false, error: 'Only administrators can update users.' }
  }

  const admin = getAdminClient()

  if (admin) {
    await admin.auth.admin.updateUserById(input.id, {
      user_metadata: { full_name: input.fullName.trim() },
      app_metadata: { role: input.role },
    })
  }

  const client = admin ?? (await createServerClient())
  const { error } = await client
    .from('profiles')
    .update({
      full_name: input.fullName.trim(),
      role: input.role,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.id)

  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, message: 'User was updated.' }
}

export async function deleteAppUser(id: string): Promise<UserActionResult> {
  const role = await getCurrentUserRole()
  if (role !== 'admin') {
    return { ok: false, error: 'Only administrators can delete users.' }
  }

  const admin = getAdminClient()
  if (!admin) {
    // Fall back to removing the profile row only.
    const client = await createServerClient()
    const { error } = await client.from('profiles').delete().eq('id', id)
    if (error) {
      return { ok: false, error: error.message }
    }
    return {
      ok: true,
      message:
        'Profile removed. Configure SUPABASE_SERVICE_ROLE_KEY to delete the underlying auth account too.',
    }
  }

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) {
    return { ok: false, error: error.message }
  }

  return { ok: true, message: 'User was deleted.' }
}
