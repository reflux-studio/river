import { cn } from 'cn'
import type { ReactNode } from 'react'

export function LobbyLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto grid max-w-[1120px] grid-cols-1 items-start gap-6 px-4 pt-6 pb-16 md:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] md:px-8 md:pt-10">
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
        <div className="flex min-w-0 flex-col gap-4 md:pt-[70px]">{aside}</div>
      </div>
    </div>
  )
}
export function LobbyRow({ label, top, children }: { label: string; top?: boolean; children: ReactNode }) {
  return (
    <div className={cn('flex gap-4', top ? 'items-start' : 'items-center')}>
      <span className={cn('w-[72px] shrink-0 text-sm text-label', top && 'pt-1.5')}>{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
