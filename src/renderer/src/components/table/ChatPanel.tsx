import { useEffect, useRef, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { invoke, toastError, useRiver } from '@/lib/river'
import type { ChatMessage } from '../../../../shared/types'

const AutopilotTag = () => (
  <span className="rounded-[5px] bg-[oklch(0.96_0.03_80)] px-1.5 py-px text-[11px] whitespace-nowrap text-[oklch(0.5_0.12_70)]">托管</span>
)

export function useSpeaker() {
  const personas = useRiver((s) => s.personas)
  return (from?: string) => {
    const p = personas.find((x) => x.id === from)
    return p ? { name: p.name, ini: p.ini, hue: p.hue as number | undefined } : { name: '你', ini: '你', hue: undefined }
  }
}

export const lastSaid = (chat: ChatMessage[]) => [...chat].reverse().find((m) => m.kind === 'msg' && m.text)

export function ChatPanel({ onCollapse }: { onCollapse: () => void }) {
  const chat = useRiver((s) => s.chat)
  const who = useSpeaker()
  const [input, setInput] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [chat.length])

  const send = () => {
    const t = input.trim()
    if (!t) return
    setInput('')
    invoke('chat.send', t).catch(toastError)
  }

  return (
    <aside className="flex min-h-0 w-[248px] shrink-0 flex-col border-r min-[1100px]:w-72">
      <div className="flex items-center gap-2 border-b border-[#f0f0ee] px-4 py-3">
        <span className="text-[15px] font-semibold">公屏</span>
        <button onClick={onCollapse} className="text-xs whitespace-nowrap text-muted-foreground">收起</button>
      </div>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 py-3.5">
        {chat.map((m) => {
          if (m.kind === 'sys') return <div key={m.id} className="text-center text-xs text-[#a1a1a6]">— {m.text} —</div>
          const s = who(m.from)
          if (m.kind === 'act')
            return (
              <div key={m.id} className="flex items-center gap-1.5 pl-[38px] text-xs text-muted-foreground">
                <span className="font-semibold text-label">{s.name}</span>
                <span>{m.act}</span>
                {m.autopilot && <AutopilotTag />}
              </div>
            )
          return (
            <div key={m.id} className="flex gap-2.5">
              <Avatar ini={s.ini} hue={s.hue} size={28} />
              <div className="flex min-w-0 flex-col gap-[3px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-semibold">{s.name}</span>
                  {m.act && <span className="rounded-[5px] bg-muted px-1.5 py-px text-[11px] whitespace-nowrap text-subtle">{m.act}</span>}
                  {m.autopilot && <AutopilotTag />}
                </div>
                <div className="text-sm leading-normal break-words [text-wrap:pretty]">{m.text}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 border-t px-4 pt-3 pb-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          // 输入法组合中的回车是选词，不是发送
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
          placeholder="对桌上说点什么…"
          className="min-w-0 flex-1 rounded-[10px] border border-input px-3 py-[9px] text-sm outline-none"
        />
        <button onClick={send} className="rounded-[10px] border border-input px-3 py-[9px] text-sm whitespace-nowrap hover:bg-accent">发送</button>
      </div>
    </aside>
  )
}
