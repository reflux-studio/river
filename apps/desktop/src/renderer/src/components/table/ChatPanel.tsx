import { MiniCards, ChatPanelLayout, ChatBubble } from '@river/ui'
import { useRiver, useT } from '@/lib/river'
import type { ChatMessage } from '../../../../shared/types'

export function useSpeaker() {
  const personas = useRiver((s) => s.personas)
  const seats = useRiver((s) => s.view?.seats)
  const t = useT()
  // 先按本桌入座快照解析：牌局中删除的对手照常显示
  return (from?: string) => {
    if (!from || from === 'hero')
      return { name: t.desktop.table.you, ini: t.desktop.table.youIni, hue: undefined as number | undefined }
    const p = seats?.find((x) => x.personaId === from) ?? personas.find((x) => x.id === from)
    return p
      ? { name: p.name, ini: p.ini, hue: p.hue as number | undefined }
      : { name: t.desktop.table.unknownSpeaker, ini: t.desktop.table.unknownSpeaker, hue: undefined }
  }
}

export const lastSaid = (chat: ChatMessage[]) =>
  [...chat].reverse().find((m): m is ChatMessage & { text: string } => m.kind === 'msg' && !!m.text)

// 公屏只读：对手只在自己回合随行动说一句，玩家不发言（U1）
export function ChatPanel({ onCollapse }: { onCollapse: () => void }) {
  const chat = useRiver((s) => s.chat)
  const who = useSpeaker()
  const c = useT().desktop.chat

  return (
    <ChatPanelLayout title={c.title} collapseLabel={c.collapse} onCollapse={onCollapse} count={chat.length}>
      {chat.map((m) => {
        if (m.kind === 'sys')
          return (
            <div key={m.id} className="flex items-center justify-center gap-1.5 text-xs text-[#a1a1a6]">
              <span>— {m.text}</span>
              {m.cards?.length ? <MiniCards cards={m.cards} /> : null}
              <span>—</span>
            </div>
          )
        const s = who(m.from)
        if (m.kind === 'act')
          return (
            <div key={m.id} className="flex items-center gap-1.5 pl-[38px] text-xs text-muted-foreground">
              <span className="font-semibold text-label">{s.name}</span>
              <span>{m.act}</span>
            </div>
          )
        return (
          <ChatBubble key={m.id} name={s.name} ini={s.ini} hue={s.hue} action={m.act}>
            {m.text}
          </ChatBubble>
        )
      })}
      {!chat.length && <div className="text-[13px] text-muted-foreground">{c.empty}</div>}
    </ChatPanelLayout>
  )
}
