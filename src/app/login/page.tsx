'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  Eye,
  EyeOff,
  FlaskConical,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react'

import {
  SUPABASE_SETUP_MESSAGE,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
} from '@/components/masters/utils'
import { Alert } from '@/components/ui/alert'
import { SpinnerIcon } from '@/components/ui/icons'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasSupabaseEnv()) {
      setCheckingSession(false)
      return
    }

    let cancelled = false
    const supabase = createClient()

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) {
          return
        }

        if (data.user) {
          router.replace('/dashboard')
          return
        }

        setCheckingSession(false)
      })
      .catch(() => {
        if (!cancelled) {
          setCheckingSession(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      return
    }

    if (!email.trim() || !password) {
      setError('Enter your email address and password.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        throw signInError
      }

      router.replace('/dashboard')
      router.refresh()
    } catch (signInError) {
      const message = getErrorMessage(signInError, 'Unable to sign in with those credentials.')

      setError(
        /invalid login credentials|invalid credentials/i.test(message)
          ? 'Incorrect email or password. Please check your details and try again.'
          : message
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-900/20">
              <FlaskConical className="h-6 w-6" />
            </span>
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
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h1>
              <p className="mt-1 text-sm text-slate-600">
                Use your work email and password to access the invoicing workspace.
              </p>
            </div>

            {error && (
              <div className="mb-4">
                <Alert tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              </div>
            )}

            {checkingSession ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <SpinnerIcon className="h-4 w-4" />
                Checking your session…
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className={labelClass}>
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                        setError(null)
                      }}
                      autoComplete="email"
                      autoFocus
                      required
                      placeholder="you@company.com"
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className={labelClass}>
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value)
                        setError(null)
                      }}
                      autoComplete="current-password"
                      required
                      placeholder="Enter your password"
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

                <button
                  type="submit"
                  disabled={submitting}
                  className={`${primaryButtonClass} w-full py-2.5`}
                >
                  {submitting ? <SpinnerIcon className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {submitting ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            Access is limited to authorised Maitree Infomed staff. Contact your administrator if you
            need an account.
          </p>
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
