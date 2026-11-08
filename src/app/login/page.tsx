'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Send,
  ShieldCheck,
} from 'lucide-react'

import {
  SUPABASE_SETUP_MESSAGE,
  getErrorMessage,
  hasSupabaseEnv,
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '@/components/masters/utils'
import { BrandMark } from '@/components/brand/brand-mark'
import { Alert } from '@/components/ui/alert'
import { SpinnerIcon } from '@/components/ui/icons'
import { createClient } from '@/utils/supabase/client'

type Mode = 'signin' | 'forgot'

const RATE_LIMIT_MESSAGE =
  'Too many emails were requested recently. Supabase allows only a couple per hour — please wait about an hour and try again.'

function isRateLimitError(message: string) {
  return /rate limit|too many requests|\b429\b/i.test(message)
}

export default function LoginPage() {
  const router = useRouter()

  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)

      if (params.get('reset') === '1') {
        setSuccessMessage('Your password was updated. Sign in with your new password.')
      }
    }
  }, [])

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

  function switchMode(nextMode: Mode) {
    setMode(nextMode)
    setError(null)
    setResetSent(false)
    setPassword('')
  }

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
    setSuccessMessage(null)

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
        isRateLimitError(message)
          ? RATE_LIMIT_MESSAGE
          : /invalid login credentials|invalid credentials/i.test(message)
            ? 'Incorrect email or password. Please check your details and try again.'
            : /email not confirmed/i.test(message)
              ? 'Your email address has not been confirmed yet. Contact your administrator or use “Forgot password?” to verify your account.'
              : message
      )
      setSubmitting(false)
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!hasSupabaseEnv()) {
      setError(SUPABASE_SETUP_MESSAGE)
      return
    }

    if (!email.trim()) {
      setError('Enter the email address connected to your account.')
      return
    }

    setResetSending(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/reset-password`
            : undefined,
      })

      if (resetError) {
        throw resetError
      }

      setResetSent(true)
    } catch (resetError) {
      const message = getErrorMessage(
        resetError,
        'Unable to send the password reset email. Please try again.'
      )

      setError(isRateLimitError(message) ? RATE_LIMIT_MESSAGE : message)
    } finally {
      setResetSending(false)
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
                {mode === 'signin' ? 'Sign in' : 'Reset your password'}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                {mode === 'signin'
                  ? 'Use your work email and password to access the invoicing workspace.'
                  : 'Enter your work email and we will send you a secure link to choose a new password.'}
              </p>
            </div>

            {successMessage && (
              <div className="mb-4">
                <Alert tone="success" onDismiss={() => setSuccessMessage(null)}>
                  {successMessage}
                </Alert>
              </div>
            )}

            {error && (
              <div className="mb-4">
                <Alert tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              </div>
            )}

            {mode === 'signin' && checkingSession ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                <SpinnerIcon className="h-4 w-4" />
                Checking your session…
              </div>
            ) : mode === 'signin' ? (
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
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="password" className={`${labelClass} mb-0`}>
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="rounded px-1.5 py-0.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                    >
                      Forgot password?
                    </button>
                  </div>
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
            ) : resetSent ? (
              <div className="space-y-4">
                <Alert tone="success">
                  If an account exists for <span className="font-medium">{email.trim()}</span>, a
                  password reset link is on its way. Check your inbox and spam folder.
                </Alert>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
                  The link expires after a short time. If it has expired, request a new one.
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setResetSent(false)}
                    className={`${secondaryButtonClass} flex-1`}
                  >
                    Resend link
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className={`${primaryButtonClass} flex-1`}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to sign in
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className={labelClass}>
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="reset-email"
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

                <button
                  type="submit"
                  disabled={resetSending}
                  className={`${primaryButtonClass} w-full py-2.5`}
                >
                  {resetSending ? <SpinnerIcon className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  {resetSending ? 'Sending reset link…' : 'Send reset link'}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
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
