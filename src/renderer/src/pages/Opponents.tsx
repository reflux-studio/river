import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Textarea } from '@/components/ui/textarea'
import { setPersonaPrompt, updateLobby, useRiver, type RiverState } from '@/lib/river'
import { cn } from '@/lib/utils'

type P = RiverState['personas'][number]

function PromptBox({ p }: { p: P }) {
  const effective = p.promptOverride ?? p.prompt
  const [text, setText] = useState(effective)
  // 恢复默认或外部改动后同步输入框
  useEffect(() => setText(effective), [effective])
  return (
    <Textarea
      rows={4}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => setPersonaPrompt(p.id, text)}
      className="min-h-0 resize-y rounded-[10px] border-input px-3 py-2.5 text-[13px] leading-[1.55] text-[#3a3a3c] shadow-none"
    />
  )
}

export function Opponents() {
  const personas = useRiver((s) => s.personas)
  const lb = useRiver((s) => s.lobby)

  const pick = (id: string) => {
    const on = lb.picks.includes(id)
    let pk = on ? lb.picks.filter((x) => x !== id) : [...lb.picks, id]
    if (pk.length > 5) pk = pk.slice(-5)
    void updateLobby({ picks: pk, size: Math.max(lb.size, Math.min(6, pk.length + 1)) as RiverState['lobby']['size'] })
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-8 pt-10 pb-16">
        <div className="flex flex-col gap-1.5">
          <div className="text-[28px] font-semibold">AI 对手</div>
          <div className="text-[15px] text-subtle">
            每位对手由一段性格提示词驱动。LLM 按它来决策、说话；本地引擎按紧度、攻击性、诈唬等倾向来打，健谈度决定说话多少。提示词可以直接改，下一手生效。
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3.5">
          {personas.map((p) => {
            const on = lb.picks.includes(p.id)
            const bars: [string, number][] = [['紧度', p.profile.tight], ['攻击性', p.profile.aggr], ['诈唬', p.profile.bluff], ['健谈度', p.talk]]
            return (
              <div key={p.id} className="flex flex-col gap-3 rounded-2xl border bg-white p-[18px]">
                <div className="flex items-center gap-3">
                  <Avatar ini={p.ini} hue={p.hue} size={44} />
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base font-semibold">{p.name}</span>
                      <span className="rounded-[5px] bg-muted px-1.5 py-px text-[11px] text-subtle">{p.tag}</span>
                    </div>
                    <span className="text-[13px] text-muted-foreground">{p.desc}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {bars.map(([l, v]) => (
                    <div key={l} className="flex items-center gap-2.5 text-xs text-muted-foreground">
                      <span className="w-11">{l}</span>
                      <div className="relative h-[5px] flex-1 rounded-full bg-[#f0f0ee]">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-foreground" style={{ width: `${v * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <PromptBox p={p} />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => pick(p.id)}
                    className={cn(
                      'rounded-full border px-3 py-[5px] text-xs',
                      on ? 'border-foreground bg-foreground text-white' : 'border-input bg-white'
                    )}
                  >
                    {on ? '✓ 已加入下一桌' : '加入下一桌'}
                  </button>
                  <div className="flex-1" />
                  {p.promptOverride !== undefined && (
                    <button onClick={() => setPersonaPrompt(p.id, '')} className="text-xs text-muted-foreground hover:text-foreground">
                      恢复默认
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
