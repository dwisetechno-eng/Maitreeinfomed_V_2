import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'

import { AppShell, type AppUser } from '@/components/layout/app-shell'
import { createClient } from '@/utils/supabase/server'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'Maitree Infomed Scientific Hub',
    template: '%s | Maitree Infomed Scientific Hub',
  },
  description:
    'Track scientific article requests, proforma invoices and tax invoices for Maitree Infomed.',
}

async function getCurrentUser(): Promise<AppUser | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return null
  }

  // `cookies()` makes every route dynamic, so it must be called outside the
  // try/catch below — otherwise Next.js' dynamic-render signal is swallowed.
  const supabase = await createClient()

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
    const appMetadata = (user.app_metadata ?? {}) as Record<string, unknown>

    // Prefer the role stored in the `profiles` table (RBAC) when available.
    let profileRole: string | null = null
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .maybeSingle()
      const profileData = profile as { role?: string | null; full_name?: string | null } | null
      profileRole = profileData?.role ?? null
      if (profileData?.full_name?.trim()) {
        metadata.full_name = profileData.full_name
      }
    } catch {
      profileRole = null
    }

    const role =
      profileRole ||
      (typeof metadata.role === 'string' && metadata.role) ||
      (typeof appMetadata.role === 'string' && appMetadata.role) ||
      'user'

    const name =
      (typeof metadata.full_name === 'string' && metadata.full_name) ||
      (typeof metadata.name === 'string' && metadata.name) ||
      user.email ||
      'User'

    return { name, email: user.email, role }
  } catch (error) {
    console.error('Unable to load the current Supabase user', error)
    return null
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser()

  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        <AppShell user={user}>{children}</AppShell>
      </body>
    </html>
  )
}
