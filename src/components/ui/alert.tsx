import type { ReactNode } from 'react'

import { CloseIcon } from '@/components/ui/icons'

type AlertProps = {
  tone: 'success' | 'error'
  children: ReactNode
  onDismiss?: () => void
}

const TONES = {
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200',
  error: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
} as const

export function Alert({ tone, children, onDismiss }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${TONES[tone]}`}
    >
      <p className="min-w-0">{children}</p>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-mr-1 shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
