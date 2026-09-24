import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Segmented } from '@/components/Segmented'
import { MiniCards } from '@/components/PlayingCard'
import { fmt, netColor, signed } from '@/lib/format'
import { go, invoke, openRules, startGuided, startTable, updateLobby, useEvent, useRiver } from '@/lib/river'
import { cn } from '@/lib/utils'
import { BLINDS } from '../../../shared/personas'
import type { HandSummary, Lobby as LobbyT } from '../../../shared/types'

const PRESETS: { t: string; d: string; cfg: Omit<LobbyT, 'mode'> }[] = [
  { t: '新手桌', d: '3 人 · 10/20 · 对手温和', cfg: { size: 3, blinds: 0, picks: ['bai', 'zen'] } },
  { t: '常规桌', d: '6 人 · 50/100 · 各种性格', cfg: { size: 6, blinds: 1, picks: ['li', 'prof', 'bai', 'k', 'rock'] } },
  { t: '单挑', d: '2 人 · 100/200 · 对阵阿狸', cfg: { size: 2, blinds: 2, picks: ['li'] } }
]
const MODE_DESC = { coach: '每次轮到你教练先说说局面；一手结束亮出所有底牌并复盘', free: '只显示胜率面板，没有教练' }

const card = 'rounded-[14px] border bg-white'
const pillBtn = 'rounded-full px-3.5 py-[7px] text-[13px]'

function Row({ label, top, children }: { label: string; top?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex gap-4', top ? 'items-start' : 'items-center')}>
      <span className={cn('w-[72px] shrink-0 text-sm text-label', top && 'pt-1.5')}>{label}</span>
      {children}
    </div>
  )
}

function Recent() {
  const [hands, setHands] = useState<HandSummary[]>([])
  const load = () => void invoke('hands.list').then((h) => setHands(h.slice(0, 5)), () => {})
  useEffect(load, [])
  useEvent('hands:changed', load)
  return (
    <div className={cn(card, 'flex flex-col gap-2.5 p-[18px]')}>
      <span className="text-[15px] font-semibold">最近手牌</span>
      {!hands.length && <span className="text-[13px] text-muted-foreground">还没有记录。</span>}
      {hands.map((h) => (
        <div key={h.id} className="flex items-center gap-2.5 text-[13px]">
          <span className="w-11 text-muted-foreground">#{h.handNo}</span>
          <span className="flex-1"><MiniCards cards={h.hero} w={20} h={28} /></span>
          <span className={cn('font-semibold', netColor(h.net))}>{signed(h.net)}</span>
        </div>
      ))}
    </div>
  )
}

export function Lobby() {
  const lb = useRiver((s) => s.lobby)
  const all = useRiver((s) => s.personas)
  const view = useRiver((s) => s.view)
  const personas = all.filter((p) => !p.deleted)
  const need = lb.size - 1
  const buy = fmt(BLINDS[lb.blinds][1] * 100)

  const toggle = (id: string) => {
    let pk = lb.picks.includes(id) ? lb.picks.filter((x) => x !== id) : [...lb.picks, id]
    if (pk.length > need) pk = pk.slice(pk.length - need)
    void updateLobby({ picks: pk })
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto grid max-w-[1120px] grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-6 px-8 pt-10 pb-16">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="text-[28px] font-semibold tracking-[-0.01em]">开一桌</div>
            <div className="text-[15px] text-subtle">只有你和 AI。每位对手都有自己的性格，轮到自己时会说一句；选教练局，教练坐在你身后。</div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {PRESETS.map((o) => {
              // 预设里被删除的角色不写入已选，开桌时随机补位
              const picks = o.cfg.picks.filter((id) => personas.some((p) => p.id === id))
              const on = o.cfg.size === lb.size && o.cfg.blinds === lb.blinds && picks.join() === lb.picks.slice(0, need).join()
              const disabled = o.cfg.size - 1 > personas.length
              return (
                <button
                  key={o.t}
                  disabled={disabled}
                  onClick={() => updateLobby({ ...o.cfg, picks })}
                  className={cn(
                    'flex flex-col gap-1.5 rounded-[14px] bg-white p-4 text-left disabled:opacity-40',
                    on ? 'border-[1.5px] border-foreground' : 'border'
                  )}
                >
                  <span className="text-base font-semibold">{o.t}</span>
                  <span className="text-[13px] leading-normal text-muted-foreground">{o.d}</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-[18px] rounded-2xl border bg-white px-[22px] py-5">
            <Row label="人数">
              <Segmented
                value={lb.size}
                // 可用对手不够时，更大的桌不可选
                options={([2, 3, 4, 5, 6] as const).map((v) => ({ label: String(v), value: v, disabled: v - 1 > personas.length }))}
                onChange={(v) => updateLobby({ size: v, picks: lb.picks.slice(0, v - 1) })}
              />
            </Row>
            <Row label="盲注">
              <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                <Segmented
                  value={lb.blinds}
                  options={([0, 1, 2] as const).map((v) => ({ label: BLINDS[v].join('/'), value: v }))}
                  onChange={(v) => updateLobby({ blinds: v })}
                />
                <span className="text-[13px] whitespace-nowrap text-muted-foreground">买入 {buy}（100 个大盲）</span>
              </div>
            </Row>
            <Row label="对手" top>
              <div className="flex flex-1 flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  {personas.map((p) => {
                    const on = lb.picks.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggle(p.id)}
                        className={cn(
                          'flex items-center gap-2 rounded-full border py-1 pr-3 pl-1',
                          on ? 'border-foreground bg-foreground text-white' : 'border-input bg-white'
                        )}
                      >
                        <Avatar ini={p.ini} hue={p.hue} size={24} />
                        <span className="text-[13px] font-medium whitespace-nowrap">{p.name}</span>
                        <span className="text-[11px] whitespace-nowrap opacity-70">{p.tag}</span>
                      </button>
                    )
                  })}
                  <button onClick={() => go('opponents')} className="flex items-center rounded-full border border-dashed border-[#cfcfcb] px-3 py-1 text-[13px] whitespace-nowrap text-label">
                    ＋ 管理对手
                  </button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {personas.length < need
                    ? `只有 ${personas.length} 位对手可用，将开 ${personas.length + 1} 人桌`
                    : lb.picks.length >= need ? `已选 ${need} 位` : `已选 ${lb.picks.length} / ${need} 位，其余随机补位`}
                </span>
              </div>
            </Row>
            <Row label="对局类型">
              <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
                <Segmented
                  value={lb.mode}
                  options={[{ label: '教练局', value: 'coach' }, { label: '自由局', value: 'free' }]}
                  onChange={(mode) => updateLobby({ mode })}
                />
                <span className="text-[13px] text-muted-foreground">{MODE_DESC[lb.mode]}</span>
              </div>
            </Row>
            <div className="flex items-center gap-3 border-t border-[#f0f0ee] pt-1">
              <div className="flex-1" />
              <button
                onClick={() => startTable({ size: lb.size, blinds: lb.blinds, picks: lb.picks, mode: lb.mode, guided: false })}
                className="mt-3.5 rounded-full bg-foreground px-[26px] py-3 text-[15px] font-medium whitespace-nowrap text-white hover:bg-foreground/85"
              >
                入座 · 买入 {buy}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-[70px]">
          {view && (
            <button onClick={() => go('table')} className="flex flex-col gap-1 rounded-[14px] bg-foreground px-[18px] py-4 text-left text-white">
              <span className="text-[15px] font-semibold">回到牌桌 →</span>
              <span className="text-[13px] text-[#a1a1a6]">{view.title} · 第 {view.handNo} 手</span>
            </button>
          )}
          <div className={cn(card, 'flex flex-col gap-2.5 p-[18px]')}>
            <span className="text-[15px] font-semibold">第一次玩德扑？</span>
            <span className="text-[13px] leading-[1.6] text-subtle">先花一分钟看规则，再跟着教练打一手：3 人小桌，教练每一步都会说话。</span>
            <div className="flex gap-2">
              <button onClick={openRules} className={cn(pillBtn, 'border border-input hover:bg-accent')}>规则介绍</button>
              <button onClick={() => startGuided()} className={cn(pillBtn, 'bg-foreground text-white hover:bg-foreground/85')}>教学牌局</button>
            </div>
          </div>
          <Recent />
        </div>
      </div>
    </div>
  )
}
