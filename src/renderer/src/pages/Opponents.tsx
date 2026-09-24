import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { avatarBg } from '@/lib/format'
import { deletePersona, resetPersona, restorePersona, savePersona, updateLobby, useRiver, type RiverState } from '@/lib/river'
import { cn } from '@/lib/utils'
import type { Persona } from '../../../shared/types'

const HUES = [25, 60, 95, 140, 170, 200, 250, 290, 340]
const ON = '0 0 0 2px #fff, 0 0 0 4px #1d1d1f'
const OFF = '0 0 0 1px rgba(0,0,0,0.14)'
const pillBtn = 'rounded-full border px-3 py-[5px] text-xs whitespace-nowrap'
const field = 'rounded-[9px] border-input shadow-none'

function PromptBox({ p }: { p: Persona }) {
  const [text, setText] = useState(p.prompt)
  // 恢复默认或外部改动后同步输入框
  useEffect(() => setText(p.prompt), [p.prompt])
  return (
    <Textarea
      rows={4}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => (text.trim() ? text !== p.prompt && void savePersona({ ...p, prompt: text.trim() }) : setText(p.prompt))}
      className="min-h-0 resize-y rounded-[10px] border-input px-3 py-2.5 text-[13px] leading-[1.55] text-[#3a3a3c] shadow-none"
    />
  )
}

function DeleteButton({ p, confirm, onAsk }: { p: Persona; confirm: boolean; onAsk: () => void }) {
  return (
    <button
      onClick={() => (confirm ? void deletePersona(p.id) : onAsk())}
      className={cn(pillBtn, confirm ? 'border-lose bg-lose text-white' : 'border-[oklch(0.88_0.05_25)] bg-white text-lose')}
    >
      {confirm ? '确认删除？' : '删除'}
    </button>
  )
}

function Editor({ p, onDone, confirm, onAsk }: { p: Persona; onDone: () => void; confirm: boolean; onAsk: () => void }) {
  const [d, setD] = useState(p)
  const set = (patch: Partial<Persona>) => setD((x) => ({ ...x, ...patch }))
  const done = async () => {
    const saved = await savePersona({ ...d, name: d.name.trim() || p.name, ini: [...(d.ini.trim() || d.name.trim().slice(0, 1) || p.ini)].slice(0, 2).join(''), prompt: d.prompt.trim() || p.prompt })
    // 保存失败时留在编辑态，改动不丢
    if (saved) onDone()
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <Avatar ini={[...d.ini].slice(0, 2).join('')} hue={d.hue} size={44} />
        <Input value={d.ini} placeholder="字" onChange={(e) => set({ ini: e.target.value })} className={cn(field, 'w-11 px-1.5 text-center')} />
        <Input value={d.name} placeholder="名字" onChange={(e) => set({ name: e.target.value })} className={cn(field, 'min-w-0 flex-1 font-semibold')} />
        <Input value={d.tag} placeholder="标签" onChange={(e) => set({ tag: e.target.value })} className={cn(field, 'w-[76px] text-[13px]')} />
      </div>
      <Input value={d.desc} placeholder="一句话简介" onChange={(e) => set({ desc: e.target.value })} className={cn(field, 'text-[13px]')} />
      <div className="flex items-center gap-2">
        <span className="w-[52px] text-xs text-muted-foreground">头像色</span>
        {HUES.map((h) => (
          <button key={h} onClick={() => set({ hue: h })} className="size-5 rounded-full" style={{ background: avatarBg(h), boxShadow: d.hue === h ? ON : OFF }} />
        ))}
      </div>
      <Textarea
        rows={5}
        value={d.prompt}
        placeholder="性格提示词：打法、说话方式、口头禅…"
        onChange={(e) => set({ prompt: e.target.value })}
        className="min-h-0 resize-y rounded-[10px] border-input px-3 py-2.5 text-[13px] leading-[1.55] text-[#3a3a3c] shadow-none"
      />
      <div className="flex items-center gap-2">
        <DeleteButton p={p} confirm={confirm} onAsk={onAsk} />
        <div className="flex-1" />
        <button onClick={done} className="rounded-full bg-foreground px-4 py-[7px] text-[13px] text-white">完成</button>
      </div>
    </div>
  )
}

export function Opponents() {
  const all = useRiver((s) => s.personas)
  const lb = useRiver((s) => s.lobby)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const personas = all.filter((p) => !p.deleted)
  const deleted = all.filter((p) => p.deleted)

  const pick = (id: string) => {
    const on = lb.picks.includes(id)
    let pk = on ? lb.picks.filter((x) => x !== id) : [...lb.picks, id]
    if (pk.length > 5) pk = pk.slice(-5)
    void updateLobby({ picks: pk, size: Math.max(lb.size, Math.min(6, pk.length + 1)) as RiverState['lobby']['size'] })
  }
  const create = async () => {
    const n = all.filter((p) => !p.builtin).length + 1
    const p = await savePersona({ name: '新对手' + n, tag: '自定义', ini: '新', hue: HUES[(Math.random() * HUES.length) | 0], desc: '', prompt: '你是……（描述 TA 的打法：紧还是松、爱不爱诈唬；以及说话方式、口头禅）' })
    if (p) setEditing(p.id)
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-8 pt-10 pb-16">
        <div className="flex items-end gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="text-[28px] font-semibold">AI 对手</div>
            <div className="text-[15px] text-pretty text-subtle">每位对手由一段性格提示词驱动，按它决策、说话。改动从下一次行动生效。</div>
          </div>
          <button onClick={create} className="rounded-full bg-foreground px-[18px] py-2.5 text-sm font-medium whitespace-nowrap text-white">＋ 新建对手</button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] items-start gap-3.5">
          {personas.map((p) => {
            const on = lb.picks.includes(p.id)
            const isEditing = editing === p.id
            return (
              <div key={p.id} className={cn('flex flex-col gap-3 rounded-2xl bg-white p-[18px]', isEditing ? 'border-[1.5px] border-foreground' : 'border')}>
                {isEditing ? (
                  <Editor p={p} confirm={confirm === p.id} onAsk={() => setConfirm(p.id)} onDone={() => setEditing(null)} />
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <Avatar ini={p.ini} hue={p.hue} size={44} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-semibold">{p.name}</span>
                          <span className="rounded-[5px] bg-muted px-1.5 py-px text-[11px] whitespace-nowrap text-subtle">{p.tag}</span>
                          {!p.builtin && <span className="rounded-[5px] bg-[oklch(0.96_0.02_255)] px-1.5 py-px text-[11px] whitespace-nowrap text-[oklch(0.5_0.15_255)]">自建</span>}
                        </div>
                        <span className="text-[13px] text-muted-foreground">{p.desc || '（还没有简介）'}</span>
                      </div>
                    </div>
                    <PromptBox p={p} />
                    <div className="flex items-center gap-2">
                      <button onClick={() => pick(p.id)} className={cn(pillBtn, on ? 'border-foreground bg-foreground text-white' : 'border-input bg-white')}>
                        {on ? '✓ 已加入下一桌' : '加入下一桌'}
                      </button>
                      <div className="flex-1" />
                      {p.edited && (
                        <button onClick={() => void resetPersona(p.id)} className="text-xs whitespace-nowrap text-muted-foreground hover:text-foreground">恢复默认</button>
                      )}
                      <button onClick={() => (setEditing(p.id), setConfirm(null))} className={cn(pillBtn, 'border-input bg-white')}>编辑</button>
                      <DeleteButton p={p} confirm={confirm === p.id} onAsk={() => setConfirm(p.id)} />
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {deleted.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span>已删除的内置对手：</span>
            {deleted.map((p) => (
              <button key={p.id} onClick={() => void restorePersona(p.id)} className="rounded-full border border-input bg-white px-2.5 py-1 whitespace-nowrap text-foreground">
                {p.name} · 恢复
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
