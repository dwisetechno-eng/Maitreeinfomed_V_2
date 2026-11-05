'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import {
  Building2,
  ChevronRight,
  CircleDollarSign,
  Contact,
  CreditCard,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Tags,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'

import { createClient } from '@/utils/supabase/client'

export type AppUser = {
  name?: string | null
  email?: string | null
  role?: string | null
}

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
}

const TRANSACTIONAL_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Article Requests', href: '/article-requests', icon: FileText },
  { label: 'Proforma Invoices', href: '/proforma-invoices', icon: FileSpreadsheet },
  { label: 'Tax Invoices', href: '/tax-invoices', icon: ReceiptText },
  { label: 'Payment Receipts', href: '/payment-receipts', icon: Wallet },
]

const MASTERS_NAV: NavItem[] = [
  { label: 'Clients', href: '/masters/clients', icon: Building2 },
  { label: 'Client Contacts', href: '/masters/client-contacts', icon: Contact },
  { label: 'Departments', href: '/masters/departments', icon: Layers },
  { label: 'Vendors', href: '/masters/vendors', icon: Truck },
  { label: 'Article Status', href: '/masters/article-status', icon: Tags },
  { label: 'Proforma Status', href: '/masters/proforma-status', icon: CircleDollarSign },
  { label: 'Tax Status', href: '/masters/tax-status', icon: CreditCard },
]

const ALL_NAV = [...TRANSACTIONAL_NAV, ...MASTERS_NAV]

const DEFAULT_USER: { name: string; email: string; role: string } = {
  name: 'Admin User',
  email: 'admin@maitreeinfomed.com',
  role: 'Administrator',
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navItemClass(active: boolean) {
  return [
    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-brand-50 text-brand-700'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
  ].join(' ')
}

export function AppShell({ user, children }: { user?: AppUser | null; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const currentUser = {
    name: user?.name || DEFAULT_USER.name,
    email: user?.email || DEFAULT_USER.email,
    role: user?.role || DEFAULT_USER.role,
  }

  const currentNav = ALL_NAV.find((item) => isActivePath(pathname, item.href))

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleLogout() {
    setSigningOut(true)

    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Unable to sign out', error)
    } finally {
      setSigningOut(false)
      setMobileOpen(false)
      router.push('/')
      router.refresh()
    }
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-900/20">
            <FlaskConical className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
              Maitree Infomed
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Scientific Hub
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation menu"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Workspace
          </p>
          {TRANSACTIONAL_NAV.map((item) => {
            const active = isActivePath(pathname, item.href)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={navItemClass(active)}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight className="ml-auto h-4 w-4 text-brand-500" />}
              </Link>
            )
          })}
        </div>

        <div className="space-y-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Masters
          </p>
          {MASTERS_NAV.map((item) => {
            const active = isActivePath(pathname, item.href)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={navItemClass(active)}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
                  }`}
                />
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight className="ml-auto h-4 w-4 text-brand-500" />}
              </Link>
            )
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-sm font-semibold text-brand-700">
            {currentUser.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{currentUser.name}</p>
            <p className="truncate text-xs text-slate-500">{currentUser.email}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 shadow-xl shadow-slate-900/5 transition-transform duration-200 lg:translate-x-0 lg:shadow-none ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Sidebar"
      >
        {sidebar}
      </aside>

      <div className="flex min-h-screen flex-col lg:pl-72">
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Maitree Infomed
            </p>
            <h2 className="truncate text-sm font-semibold text-slate-900">
              {currentNav?.label ?? 'Scientific Hub'}
            </h2>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
              {currentUser.role}
            </span>

            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Logout'}</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>

        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <p>© {new Date().getFullYear()} Maitree Infomed. All rights reserved.</p>
            <p>Scientific Hub</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
