'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'
type TooltipMode = 'styled' | 'native'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'title'> & {
  /** Accessible name; also shown as the tooltip. */
  label: string
  icon: ReactNode
  variant?: Variant
  size?: Size
  /**
   * `styled` renders a floating tooltip on hover/focus; `native` falls back to the
   * browser `title` tooltip (safer inside horizontally scrolling tables).
   */
  tooltip?: TooltipMode
  /** Override the tooltip text, e.g. to explain why the button is disabled. */
  tooltipText?: string
  /** Optional visible text shown beside the icon from the `sm` breakpoint upward. */
  text?: string
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
  secondary:
    'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-brand-500',
  danger: 'text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 min-w-8 px-1.5 text-xs rounded-lg',
  md: 'h-10 min-w-10 px-2.5 text-sm rounded-xl',
}

export function IconButton({
  label,
  icon,
  variant = 'secondary',
  size = 'md',
  tooltip = 'styled',
  tooltipText,
  text,
  className = '',
  ...rest
}: IconButtonProps) {
  const tip = tooltipText ?? label

  const button = (
    <button
      type="button"
      aria-label={label}
      title={tooltip === 'native' ? tip : undefined}
      className={[
        'inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      {...rest}
    >
      <span className="shrink-0 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      {text && <span className="hidden whitespace-nowrap sm:inline">{text}</span>}
    </button>
  )

  if (tooltip === 'native') {
    return button
  }

  return (
    <span className="group relative inline-flex">
      {button}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {tip}
      </span>
    </span>
  )
}
