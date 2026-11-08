'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck } from 'lucide-react'

import {
  SUPABASE_SETUP_MESSAGE,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
} from '@/components/masters/utils'
import { BrandMark } from '@/components/brand/brand-mark'
import { Alert } from '@/components/ui/alert'
import { SpinnerIcon } from '@/components/ui/icons'
import { createClient } from '@/utils/supabase/client'

type Status = 'checking' | 'ready' | 'invalid' | 'done'

export default function ResetPasswordPage() {
  const router = useRouter()

  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      setStatus('invalid')
      return
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const errorDescription = params.get('error_description')

      if (errorDescription) {
        setError(errorDescription)
        setStatus('invalid')
        return
      }
    }

    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const supabase = createClient()

    function markReady() {
      if (cancelled) {
        return
      }

      if (timeout) {
        clearTimeout(timeout)
      }

      setStatus('ready')
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        markReady()
      }
    })

    // The recovery token is exchanged on the client. Give the library a moment
    // before declaring the link invalid.
    timeout = setTimeout(() => {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (cancelled) {
            return
          }

          if (data.session) {
            markReady()
          } else {
            setStatus('invalid')
          }
        })
        .catch(() => {
          if (!cancelled) {
            setStatus('invalid')
          }
        })
    }, 2000)

    return () => {
      cancelled = true
      if (timeout) {
        clearTimeout(timeout)
      }
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      return
    }

    if (password.length < 8) {
      setError('Use at least 8 characters for your new password.')
      return
    }

    if (password !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        throw updateError
      }

      // Force a fresh sign-in with the new password.
      await supabase.auth.signOut().catch(() => undefined)

      setStatus('done')
      window.setTimeout(() => {
        router.replace('/login?reset=1')
        router.refresh()
      }, 1200)
    } catch (updateError) {
      setError(
        getErrorMessage(updateError, 'Unable to update your password. Request a new reset link.')
      )
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-3">
            <BrandMark className="h-12 w-12 drop-shadow-sm" />
            <div className="leading-tight">
              <p className="text-base font-semibold tracking-tight text-slate-900">
                Maitree Infomed
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-700">
                Scientific Hub
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                Choose a new password
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Set a strong password for your Maitree Infomed account.
              </p>
            </div>

            {error && (
              <div className="mb-4">
                <Alert tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              </div>
            )}

            {status === 'checking' ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <SpinnerIcon className="h-4 w-4" />
                Verifying your reset link…
              </div>
            ) : status === 'invalid' ? (
              <div className="space-y-4">
                <Alert tone="error">
                  This password reset link is invalid or has expired. Request a new link from the
                  sign-in page.
                </Alert>

                <Link
                  href="/login"
                  className={`${primaryButtonClass} w-full py-2.5`}
                >
                  <KeyRound className="h-4 w-4" />
                  Request a new link
                </Link>
              </div>
            ) : status === 'done' ? (
              <div className="space-y-4">
                <Alert tone="success">
                  Your password has been updated. Redirecting you to sign in…
                </Alert>
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500">
                  <SpinnerIcon className="h-4 w-4" />
                  Taking you to the sign-in page
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="new-password" className={labelClass}>
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="new-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value)
                        setError(null)
                      }}
                      autoComplete="new-password"
                      autoFocus
                      required
                      minLength={8}
                      placeholder="At least 8 characters"
                      className={`${inputClass} pl-9 pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className={labelClass}>
                    Confirm new password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(event) => {
                        setConfirmPassword(event.target.value)
                        setError(null)
                      }}
                      autoComplete="new-password"
                      required
                      minLength={8}
                      placeholder="Re-enter your new password"
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className={`${primaryButtonClass} w-full py-2.5`}
                >
                  {saving ? <SpinnerIcon className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {saving ? 'Updating password…' : 'Update password'}
                </button>

                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
                >
                  Back to sign in
                </Link>
              </form>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Maitree Infomed. All rights reserved.</p>
          <p>Scientific Hub</p>
        </div>
      </footer>
    </div>
  )
}
