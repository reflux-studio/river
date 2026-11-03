import type { ReactNode } from 'react'
import { Switch } from '@river/ui'

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ')

export const panel = 'flex min-w-0 flex-col gap-[18px] rounded-[14px] border bg-white px-[22px] py-5'
export const pill =
  'inline-flex items-center gap-1.5 rounded-full border border-input bg-white px-3.5 py-[7px] text-[13px] whitespace-nowrap hover:bg-accent'
export const primary =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium whitespace-nowrap text-white hover:bg-foreground/85 disabled:opacity-40'
export const ghost = 'rounded-full px-2.5 py-1 text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground'
export const field =
  'w-full rounded-[10px] border border-input bg-white px-3 py-2 text-sm outline-none focus:border-foreground/40'
export const label = 'text-[13px] text-label'
export const row = 'flex flex-col gap-3 border-b border-divider py-3.5 last:border-0'

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx(panel, className)}>{children}</section>
}

export function PanelTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <h2 className="text-[15px] font-semibold">{children}</h2>
      <div className="flex-1" />
      {action}
    </div>
  )
}

export function Kpi({
  title,
  value,
  hint,
  tone
}: {
  title: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'win' | 'lose'
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border bg-white px-4 py-3.5">
      <span className="text-xs text-muted-foreground">{title}</span>
      <span
        className={cx(
          'text-2xl font-semibold tracking-[-0.01em]',
          tone === 'win' && 'text-win',
          tone === 'lose' && 'text-lose'
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-[#a1a1a6]">{hint}</span>}
    </div>
  )
}

export function SettingRow({
  title,
  desc,
  children,
  below
}: {
  title: ReactNode
  desc?: ReactNode
  children?: ReactNode
  below?: ReactNode
}) {
  return (
    <div className={row}>
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          {desc && <span className="text-xs leading-normal text-muted-foreground">{desc}</span>}
        </div>
        {children}
      </div>
      {below}
    </div>
  )
}

export function SwitchRow({
  title,
  desc,
  checked,
  onChange,
  disabled
}: {
  title: ReactNode
  desc?: ReactNode
  checked: boolean
  onChange(checked: boolean): void
  disabled?: boolean
}) {
  return (
    <SettingRow title={title} desc={desc}>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </SettingRow>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[14px] border border-dashed border-input px-4 py-8 text-center text-[13px] text-muted-foreground">
      {children}
    </div>
  )
}
