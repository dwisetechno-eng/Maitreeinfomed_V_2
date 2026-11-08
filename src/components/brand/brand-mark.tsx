import type { SVGProps } from 'react'

type BrandMarkProps = SVGProps<SVGSVGElement> & {
  /**
   * `solid` paints a green tile with a white pulse (site chrome).
   * `light` paints a white tile with a green pulse (dark surfaces/letterhead).
   */
  variant?: 'solid' | 'light'
}

/**
 * Maitree Infomed brand mark: a rounded tile whose "M" is drawn as an ECG
 * pulse, combining medical content with scientific tracking. The SVG twin is
 * the source of truth; the document renderer embeds the generated PNG in
 * `src/lib/maitree-logo.ts`.
 */
export function BrandMark({ variant = 'solid', ...props }: BrandMarkProps) {
  const solid = variant === 'solid'

  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="15"
        fill={solid ? '#065F46' : '#FFFFFF'}
      />
      <polyline
        points="16,44 22,20 32,36 42,20 48,44"
        fill="none"
        stroke={solid ? '#FFFFFF' : '#065F46'}
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
