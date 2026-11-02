import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { Avatar } from './avatar'

export function ChatPanelLayout({
  title,
  collapseLabel,
  onCollapse,
  count,
  children,
  composer
}: {
  title: string
  collapseLabel: string
  onCollapse(): void
  count: number
  children: ReactNode
  composer?: ReactNode
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count])
  return (
    <aside className="river-chat-panel flex min-h-0 w-[248px] shrink-0 flex-col border-r min-[1100px]:w-72">
      <div className="flex items-center gap-2 border-b border-[#f0f0ee] px-4 py-3">
        <span className="text-[15px] font-semibold">{title}</span>
        <button onClick={onCollapse} className="text-xs whitespace-nowrap text-muted-foreground">
          {collapseLabel}
        </button>
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3.5">
        {children}
      </div>
      {composer}
    </aside>
  )
}
export function ChatBubble({
  name,
  ini,
  hue,
  action,
  children
}: {
  name: string
  ini: string
  hue?: number
  action?: string
  children: ReactNode
}) {
  return (
    <div className="flex gap-2.5">
      <Avatar ini={ini} hue={hue} size={28} />
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-semibold">{name}</span>
          {action && (
            <span className="rounded-[5px] bg-muted px-1.5 py-px text-[11px] whitespace-nowrap text-subtle">
              {action}
            </span>
          )}
        </div>
        <div className="text-sm leading-normal break-words [text-wrap:pretty]">{children}</div>
      </div>
    </div>
  )
}
