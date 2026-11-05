import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'

import { Header, type HeaderUser } from '@/components/layout/header'
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

async function getCurrentUser(): Promise<HeaderUser | null> {
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

    const role =
      (typeof metadata.role === 'string' && metadata.role) ||
      (typeof appMetadata.role === 'string' && appMetadata.role) ||
      'User'

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
        <div className="flex min-h-screen flex-col">
          <Header user={user} />

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>

          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <p>© {new Date().getFullYear()} Maitree Infomed. All rights reserved.</p>
              <p>Scientific Hub</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
