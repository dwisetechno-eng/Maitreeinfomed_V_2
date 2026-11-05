/**
 * Create or update an admin user through the Supabase Auth Admin API.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY. Add it to `.env.local` (it is already
 * git-ignored) or export it in your shell before running:
 *
 *   npm run create-admin -- admin@maitreeinfomed.com "YourStrongPassword!" "Admin User"
 *
 * The service role key is only read on this machine and is never sent anywhere
 * except your own Supabase project.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

loadEnvFile()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const [emailArg, passwordArg, fullNameArg, roleArg] = process.argv.slice(2)
const email = emailArg?.trim()
const password = passwordArg
const fullName = fullNameArg?.trim() || 'Administrator'
const role = roleArg?.trim() || 'Administrator'

if (!supabaseUrl) {
  fail('NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.')
}

if (!serviceRoleKey) {
  fail(
    'SUPABASE_SERVICE_ROLE_KEY is missing. Add it to .env.local (Project Settings → API → service_role secret) and run again.'
  )
}

if (!email || !password) {
  fail(
    'Usage: npm run create-admin -- <email> <password> [full name] [role]\n' +
      'Example: npm run create-admin -- admin@maitreeinfomed.com "StrongPassword!" "Admin User"'
  )
}

if (password.length < 8) {
  fail('Use a password with at least 8 characters.')
}

const adminHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
}

const existing = await findUser(email)
const metadata = {
  full_name: fullName,
  name: fullName,
  role,
}
const appMetadata = {
  role,
}

if (existing) {
  const response = await fetch(`${supabaseUrl}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata ?? {}), ...metadata },
      app_metadata: { ...(existing.app_metadata ?? {}), ...appMetadata },
    }),
  })

  if (!response.ok) {
    fail(`Unable to update the existing user: ${response.status} ${await response.text()}`)
  }

  console.log(`Updated admin user ${email}.`)
  console.log('You can now sign in with the password you supplied.')
  process.exit(0)
}

const response = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
    app_metadata: appMetadata,
  }),
})

if (!response.ok) {
  fail(`Unable to create the admin user: ${response.status} ${await response.text()}`)
}

console.log(`Created admin user ${email} (email already confirmed).`)
console.log('You can now sign in with the password you supplied.')

async function findUser(targetEmail) {
  let page = 1

  while (page <= 20) {
    const response = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers: adminHeaders }
    )

    if (!response.ok) {
      fail(`Unable to list existing users: ${response.status} ${await response.text()}`)
    }

    const payload = await response.json()
    const users = Array.isArray(payload.users) ? payload.users : []
    const match = users.find(
      (user) => (user.email ?? '').toLowerCase() === targetEmail.toLowerCase()
    )

    if (match) {
      return match
    }

    if (users.length < 200) {
      return null
    }

    page += 1
  }

  return null
}

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env.local')

  if (!existsSync(envPath)) {
    return
  }

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')

    if (separator === -1) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function fail(message) {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}
