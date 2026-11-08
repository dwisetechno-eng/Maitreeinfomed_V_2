import type { SVGProps } from 'react'

type BrandMarkProps = SVGProps<SVGSVGElement> & {
  /**
   * `solid` paints a green tile with white marks (site chrome).
   * `light` paints a white tile with green marks (document letterhead).
   */
  variant?: 'solid' | 'light'
}

/**
 * Maitree Infomed brand mark: a rounded tile combining a document (science
 * articles) with a capsule (pharma). The SVG twin is the source of truth; the
 * document renderer embeds the generated PNG in `src/lib/maitree-logo.ts`.
 */
export function BrandMark({ variant = 'solid', ...props }: BrandMarkProps) {
  const solid = variant === 'solid'

  const tile = solid ? '#065F46' : '#FFFFFF'
  const page = solid ? '#FFFFFF' : '#065F46'
  const fold = solid ? '#D1FAE5' : '#A7F3D0'
  const lines = solid ? '#065F46' : '#FFFFFF'
  const pill = solid ? '#FFFFFF' : '#10B981'
  const pillLine = solid ? '#065F46' : '#FFFFFF'

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" {...props}>
      <rect x="3" y="3" width="58" height="58" rx="15" fill={tile} />
      {/* Document page */}
      <rect x="15" y="12" width="26" height="36" rx="3" fill={page} />
      {/* Folded corner */}
      <path d="M33 12 L41 12 L41 20 Z" fill={fold} />
      {/* Text lines (articles) */}
      <rect x="19" y="20" width="16" height="2.5" rx="1.25" fill={lines} />
      <rect x="19" y="26" width="18" height="2.5" rx="1.25" fill={lines} />
      <rect x="19" y="32" width="12" height="2.5" rx="1.25" fill={lines} />
      {/* Pharma capsule */}
      <g transform="translate(37 40) rotate(-25)">
        <rect x="0" y="0" width="20" height="9" rx="4.5" fill={pill} />
        <line
          x1="10"
          y1="1"
          x2="10"
          y2="8"
          stroke={pillLine}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
