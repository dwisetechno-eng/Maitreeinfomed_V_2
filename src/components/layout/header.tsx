'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { createClient } from '@/utils/supabase/client'

export type HeaderUser = {
  name?: string | null
  email?: string | null
  role?: string | null
}

type NavItem = {
  label: string
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Article Requests', href: '/article-requests' },
  { label: 'Proforma Invoices', href: '/proforma-invoices' },
  { label: 'Tax Invoices', href: '/tax-invoices' },
]

const MASTERS_ITEMS: NavItem[] = [
  { label: 'Clients', href: '/masters/clients' },
  { label: 'Vendors', href: '/masters/vendors' },
  { label: 'Departments', href: '/masters/departments' },
  { label: 'Article Status', href: '/masters/article-status' },
  { label: 'Proforma Status', href: '/masters/proforma-status' },
  { label: 'Tax Status', href: '/masters/tax-status' },
]

// Placeholder identity used until Supabase Auth is wired into the layout.
const DEFAULT_USER: Required<HeaderUser> = {
  name: 'Admin User',
  email: 'admin@maitreeinfomed.com',
  role: 'Administrator',
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function navLinkClass(active: boolean) {
  return [
    'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-brand-50 text-brand-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ')
}

export function Header({ user }: { user?: HeaderUser | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [mastersOpen, setMastersOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileMastersOpen, setMobileMastersOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const currentUser = {
    name: user?.name || DEFAULT_USER.name,
    email: user?.email || DEFAULT_USER.email,
    role: user?.role || DEFAULT_USER.role,
  }

  const mastersActive = MASTERS_ITEMS.some((item) => isActivePath(pathname, item.href))

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMastersOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMastersOpen(false)
        setMobileOpen(false)
        setMobileMastersOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    setMastersOpen(false)
    setMobileOpen(false)
    setMobileMastersOpen(false)
  }, [pathname])

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

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/dashboard"
          aria-label="Maitree Infomed Scientific Hub — Dashboard"
          className="flex shrink-0 items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-900/20">
            <BeakerIcon className="h-5 w-5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-slate-900 sm:text-base">
              Maitree Infomed
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
              Scientific Hub
            </span>
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActivePath(pathname, item.href) ? 'page' : undefined}
              className={navLinkClass(isActivePath(pathname, item.href))}
            >
              {item.label}
            </Link>
          ))}

          <div ref={dropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setMastersOpen((open) => !open)}
              aria-expanded={mastersOpen}
              aria-haspopup="true"
              className={navLinkClass(mastersActive || mastersOpen)}
            >
              Masters Hub
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform duration-200 ${
                  mastersOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {mastersOpen && (
              <div className="absolute left-0 top-full z-50 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/10">
                <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Masters
                </p>
                {MASTERS_ITEMS.map((item) => {
                  const active = isActivePath(pathname, item.href)

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMastersOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right lg:block">
            <p className="text-sm font-medium leading-tight text-slate-900">{currentUser.name}</p>
            <p className="text-xs leading-tight text-slate-500">{currentUser.email}</p>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-600/20">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
            {currentUser.role}
          </span>

          <button
            type="button"
            onClick={handleLogout}
            disabled={signingOut}
            className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 sm:inline-flex"
          >
            <LogoutIcon className="h-4 w-4" />
            {signingOut ? 'Signing out…' : 'Logout'}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 md:hidden"
          >
            {mobileOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div id="mobile-nav" className="border-t border-slate-200 bg-white md:hidden">
          <nav aria-label="Mobile" className="space-y-1 px-4 py-4 sm:px-6">
            {NAV_ITEMS.map((item) => {
              const active = isActivePath(pathname, item.href)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}

            <button
              type="button"
              onClick={() => setMobileMastersOpen((open) => !open)}
              aria-expanded={mobileMastersOpen}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mastersActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              Masters Hub
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform duration-200 ${
                  mobileMastersOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {mobileMastersOpen && (
              <div className="ml-3 space-y-1 border-l border-slate-200 pl-3">
                {MASTERS_ITEMS.map((item) => {
                  const active = isActivePath(pathname, item.href)

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'bg-brand-50 font-medium text-brand-700'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            )}

            <div className="mt-3 border-t border-slate-200 pt-3">
              <div className="px-3 pb-2">
                <p className="text-sm font-medium text-slate-900">{currentUser.name}</p>
                <p className="text-xs text-slate-500">{currentUser.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={signingOut}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogoutIcon className="h-4 w-4" />
                {signingOut ? 'Signing out…' : 'Logout'}
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}

function BeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M9 3h6M10 3v4.4L5.7 16.3A2.4 2.4 0 0 0 7.9 20h8.2a2.4 2.4 0 0 0 2.2-3.7L14 7.4V3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M7.2 14h9.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="m5 7.5 5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
