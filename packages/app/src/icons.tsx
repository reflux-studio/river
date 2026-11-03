import type { SVGProps } from 'react'

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props
})

export const IconBack = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export const IconLink = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
    <path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1" />
  </svg>
)

export const IconChat = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z" />
  </svg>
)

export const IconUsers = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  </svg>
)

export const IconVolume = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
)

export const IconMuted = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M11 5L6 9H3v6h3l5 4V5z" />
    <path d="M22 9l-6 6M16 9l6 6" />
  </svg>
)

export const IconSend = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)

export const IconCheck = (props: SVGProps<SVGSVGElement>) => (
  <svg {...base(props)}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
)
