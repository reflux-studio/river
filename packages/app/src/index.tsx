import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react'
import {
  MiniCard,
  useHotkeys,
  Segmented,
  RichText,
  TableStage,
  feltOf,
  FELTS,
  BACKS,
  ActionControls,
  LobbyLayout,
  LobbyRow,
  ChatPanelLayout,
  ChatBubble,
  type SeatView,
  type Felt,
  type Back,
  type Fx
} from '@river/ui'
import { RiverClient, webSocketTransport, type KeyValueStore } from '@river/client'
import type {
  CommandPayload,
  CommandType,
  PersonalHandRecord,
  PersonalRoomSummary,
  PublicProfile,
  RoomView
} from '@river/protocol'
export { browserStore } from './browser-store'

import type { DesktopHost } from './host'
export type { DesktopHost } from './host'
const defaults: CommandPayload<'room.rules'>['rules'] = {
  capacity: 6,
  smallBlind: 5,
  bigBlind: 10,
  defaultBuyIn: 1000,
  humanTurnMs: 30000,
  disconnectGraceMs: 60000,
  showingMs: 10000,
  coachAllowed: false,
  revealAllAfterHand: false,
  spectatorVision: true
}
const number = (value: number) => value.toLocaleString('zh-CN')

export function RiverApp({
  store,
  defaultServer,
  host,
  onSettings,
  tableAppearance,
  onAppearance
}: {
  store: KeyValueStore
  defaultServer: string
  host?: DesktopHost
  onSettings?: () => void
  tableAppearance?: { felt: Felt; feltCustom: string; back: Back; fx: Fx }
  onAppearance?: (value: { felt: Felt; feltCustom: string; back: Back; fx: Fx }) => void
}) {
  const [url, setUrl] = useState(defaultServer)
  const [address, setAddress] = useState(defaultServer)
  const [client, setClient] = useState<RiverClient | null>(null)
  const [profile, setProfile] = useState<PublicProfile>({
    profileId: crypto.randomUUID(),
    name: '',
    ini: '我',
    hue: 158,
    locale: 'zh'
  })
  const [room, setRoom] = useState(location.pathname.split('/join/')[1]?.split('/')[0] ?? '')
  const [rules, setRules] = useState(defaults)
  const [error, setError] = useState('')
  const [sound, setSound] = useState(true)
  const [tab, setTab] = useState<'table' | 'history'>('table')
  useEffect(() => {
    void store.get<PublicProfile>('profile').then((saved) => {
      if (saved) setProfile(saved)
    })
  }, [store])
  useEffect(() => {
    const next = new RiverClient(url === 'local' && host ? host.localTransport() : webSocketTransport(url), store, url)
    setClient(next)
    void next.connect().catch((e) => setError(String(e)))
    return () => next.close()
  }, [url, store, host])
  const state = useSyncExternalStore(client?.subscribe ?? (() => () => {}), client?.getSnapshot ?? (() => emptyState))
  useEffect(() => {
    void store.get<boolean>('sound').then((saved) => {
      if (saved !== undefined) setSound(saved)
    })
  }, [store])
  useEffect(() => {
    if (!sound || !state.effects.length) return
    const card = state.effects.some((event) => event.type === 'deal' || event.type === 'boardDealt')
    const chips = state.effects.some((event) => event.type === 'actionApplied' || event.type === 'fundsChanged')
    if (!card && !chips) return
    const audio = new Audio(
      card
        ? new URL('./assets/card-place-1.ogg', import.meta.url).href
        : new URL('./assets/chips-handle-1.ogg', import.meta.url).href
    )
    audio.volume = 0.25
    void audio.play().catch(() => {})
  }, [state.effects, sound])

  async function enter(create: boolean) {
    if (!client || !profile.name.trim()) {
      setError('先起一个昵称')
      return
    }
    try {
      setError('')
      await store.set('profile', profile)
      if (create) await client.create(profile, rules)
      else await client.join(room.trim().split('/join/').at(-1)!, profile)
      await client.command('funds.buyIn', { amount: rules.defaultBuyIn })
    } catch (e) {
      setError(String(e))
    }
  }
  return (
    <div className="river-game" data-desktop={!!host}>
      <header className="river-header flex h-[52px] shrink-0 items-center gap-3 border-b bg-topbar px-4">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setTab('table')
          }}
          className="flex shrink-0 items-center gap-1.5 text-base font-semibold"
        >
          <img src={new URL('./assets/river-icon.png', import.meta.url).href} alt="" width={28} height={28} />
          River
        </a>
        <nav>
          <button
            onClick={() => {
              setSound(!sound)
              void store.set('sound', !sound)
            }}
          >
            {sound ? '声音开' : '声音关'}
          </button>
          <button onClick={() => setTab(tab === 'history' ? 'table' : 'history')}>
            {tab === 'history' ? '回到牌桌' : '本地战绩'}
          </button>
          {onSettings && <button onClick={onSettings}>模型与设置</button>}
        </nav>
        <span className={`river-status ${state.connected ? 'online' : ''}`}>
          {state.connected ? '已连接' : '连接中'}
        </span>
      </header>
      {(error || state.error) && (
        <div className="river-error" role="alert">
          {error || state.error}
          <button aria-label="关闭提示" onClick={() => setError('')}>
            ×
          </button>
        </div>
      )}
      {tab === 'history' ? (
        <History store={store} />
      ) : state.view && client ? (
        <Room
          client={client}
          view={state.view}
          host={host}
          connected={state.connected}
          onError={setError}
          tableAppearance={tableAppearance}
          onAppearance={onAppearance}
          store={store}
        />
      ) : (
        <LobbyLayout
          aside={
            <>
              <section className="river-panel">
                <h2>加入朋友的牌桌</h2>
                <label>
                  邀请链接 / 房间号
                  <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="粘贴朋友发来的链接" />
                </label>
                <button
                  className="river-primary"
                  disabled={!state.connected || !room.trim()}
                  onClick={() => void enter(false)}
                >
                  加入牌桌
                </button>
              </section>
              <section className="river-panel">
                <h2>本地战绩</h2>
                <p className="text-[13px] text-muted-foreground">每场买入、盈亏与牌谱保存在这台设备。</p>
                <button onClick={() => setTab('history')}>查看战绩</button>
              </section>
            </>
          }
        >
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-semibold tracking-[-0.01em]">开始一局</h1>
            <p className="text-[15px] text-subtle">选好牌桌，邀请朋友入座。</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              [3, 5, 10, '轻松小局'],
              [6, 10, 20, '朋友聚会'],
              [10, 25, 50, '十人满桌']
            ].map(([capacity, smallBlind, bigBlind, label]) => (
              <button
                key={capacity}
                onClick={() =>
                  setRules({
                    ...rules,
                    capacity: +capacity as typeof rules.capacity,
                    smallBlind: +smallBlind,
                    bigBlind: +bigBlind
                  })
                }
                className={`flex flex-col gap-1.5 rounded-[14px] border bg-white p-4 text-left ${rules.capacity === capacity && rules.smallBlind === smallBlind && rules.bigBlind === bigBlind ? 'border-foreground' : ''}`}
              >
                <span className="text-base font-semibold">{label}</span>
                <span className="text-[13px] text-muted-foreground">
                  {capacity} 人 · {smallBlind}/{bigBlind}
                </span>
              </button>
            ))}
          </div>
          <section className="river-panel">
            <LobbyRow label="昵称">
              <label className="sr-only" htmlFor="river-name">
                你的昵称
              </label>
              <input
                id="river-name"
                maxLength={80}
                placeholder="牌桌上怎么称呼你"
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value, ini: e.target.value.slice(0, 1) || '我' })
                }
              />
            </LobbyRow>
            <details>
              <summary>连接地址</summary>
              <div className="river-row">
                <input aria-label="服务地址" value={address} onChange={(e) => setAddress(e.target.value)} />
                <button onClick={() => setUrl(address)}>连接</button>
              </div>
              {host && (
                <button
                  onClick={() => {
                    setUrl('local')
                    setAddress('local')
                  }}
                >
                  使用本机运行时
                </button>
              )}
            </details>
            <LobbyRow label="人数">
              <div className="overflow-x-auto">
                <Segmented
                  value={rules.capacity}
                  options={Array.from({ length: 9 }, (_, i) => ({
                    label: String(i + 2),
                    value: (i + 2) as typeof rules.capacity
                  }))}
                  onChange={(capacity) => setRules({ ...rules, capacity })}
                />
              </div>
            </LobbyRow>
            <LobbyRow label="盲注">
              <Segmented
                value={`${rules.smallBlind}/${rules.bigBlind}`}
                options={[
                  [5, 10],
                  [10, 20],
                  [25, 50]
                ].map(([small, big]) => ({ label: `${small}/${big}`, value: `${small}/${big}` }))}
                onChange={(value) => {
                  const [smallBlind, bigBlind] = value.split('/').map(Number)
                  setRules({ ...rules, smallBlind, bigBlind })
                }}
              />
            </LobbyRow>
            <LobbyRow label="起手买入">
              <input
                aria-label="起手买入"
                type="number"
                min="1"
                max="1000000000"
                value={rules.defaultBuyIn}
                onChange={(e) => setRules({ ...rules, defaultBuyIn: +e.target.value })}
              />
            </LobbyRow>
            <RuleToggles rules={rules} onChange={setRules} />
            <button className="river-primary" disabled={!state.connected} onClick={() => void enter(true)}>
              创建好友房
            </button>
          </section>
        </LobbyLayout>
      )}
    </div>
  )
}
const emptyState = { view: null, connected: false, error: null, effects: [] as import('@river/protocol').Effect[] }

function RuleToggles({ rules, onChange }: { rules: typeof defaults; onChange(rules: typeof defaults): void }) {
  return (
    <>
      <div className="river-checks">
        {(
          [
            ['spectatorVision', '场下观战透视'],
            ['coachAllowed', '允许本地教练'],
            ['revealAllAfterHand', '手后公开所有底牌']
          ] as const
        ).map(([key, title]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={rules[key]}
              onChange={(e) => onChange({ ...rules, [key]: e.target.checked })}
            />
            {title}
          </label>
        ))}
      </div>
      <details>
        <summary>计时设置</summary>
        <div className="river-formgrid">
          {(
            [
              ['humanTurnMs', '真人回合 / 秒'],
              ['disconnectGraceMs', '掉线宽限 / 秒'],
              ['showingMs', '手后展示 / 秒']
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                value={rules[key] / 1000}
                onChange={(e) => onChange({ ...rules, [key]: +e.target.value * 1000 })}
              />
            </label>
          ))}
        </div>
      </details>
    </>
  )
}

function Room({
  client,
  view,
  host,
  connected,
  onError,
  tableAppearance,
  onAppearance,
  store
}: {
  client: RiverClient
  view: RoomView
  host?: DesktopHost
  connected: boolean
  onError(error: string): void
  tableAppearance?: { felt: Felt; feltCustom: string; back: Back; fx: Fx }
  onAppearance?: (value: { felt: Felt; feltCustom: string; back: Back; fx: Fx }) => void
  store: KeyValueStore
}) {
  const [showChat, setShowChat] = useState(() => window.innerWidth >= 1100)
  const [showTools, setShowTools] = useState(false)
  const [showCoach, setShowCoach] = useState(() => window.innerWidth >= 1000)
  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 900px)')
    const update = () => {
      setShowChat(!narrow.matches)
      setShowCoach(!narrow.matches)
    }
    narrow.addEventListener('change', update)
    return () => narrow.removeEventListener('change', update)
  }, [])
  const [localAppearance, setLocalAppearance] = useState<{ felt: Felt; feltCustom: string; back: Back; fx: Fx }>({
    felt: 'green',
    feltCustom: '#39775c',
    back: 'red',
    fx: 'full'
  })
  const appearance = tableAppearance ?? localAppearance
  const setAppearance = (value: typeof appearance) => {
    if (onAppearance) onAppearance(value)
    else {
      setLocalAppearance(value)
      void store.set('appearance', value)
    }
  }
  useEffect(() => {
    if (!tableAppearance)
      void store.get<typeof appearance>('appearance').then((saved) => {
        if (saved) setLocalAppearance(saved)
      })
  }, [store, !!tableAppearance])
  const [amount, setAmount] = useState(view.rules.defaultBuyIn)
  const [raise, setRaise] = useState(view.rules.bigBlind * 2)
  const [message, setMessage] = useState('')
  const [now, setNow] = useState(Date.now())
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([])
  const [template, setTemplate] = useState('')
  const [coach, setCoach] = useState('')
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [equities, setEquities] = useState<Record<string, number>>({})
  const self = view.participants.find((p) => p.participantId === view.self.participantId)!
  const isHost = view.hostId === self.participantId
  const hand = view.hand
  const equityKey = `${hand?.handId}:${hand?.board.join(',')}:${view.participants.map((p) => `${p.participantId}:${p.totalIn}:${p.folded}:${p.hole?.map((s) => (s.visibility === 'known' ? s.card : '?')).join('')}`).join('|')}`
  useEffect(() => {
    const worker = new Worker(new URL('./equity-worker.ts', import.meta.url), { type: 'module' })
    setEquities({})
    worker.onmessage = (event) => setEquities(event.data as Record<string, number>)
    worker.postMessage(view)
    return () => worker.terminate()
  }, [equityKey])
  const decision = hand?.decision
  const legal = decision?.legal
  const [nextRules, setNextRules] = useState(view.rules)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (host)
      void host.personas().then((items) => {
        setPersonas(items)
        setTemplate(items[0]?.id ?? '')
      })
  }, [host])
  useEffect(() => {
    if (legal?.minRaiseTo) setRaise(legal.minRaiseTo)
  }, [legal?.minRaiseTo, decision?.decisionId])
  useEffect(() => {
    let current = true
    if (host && view.rules.coachAllowed && (decision || view.phase === 'showing')) {
      setCoach('教练思考中…')
      void host.coach(view).then(
        (text) => {
          if (current) setCoach(text)
        },
        (e) => {
          if (current) setCoach(String(e))
        }
      )
    }
    return () => {
      current = false
    }
  }, [decision?.decisionId, view.phase === 'showing' ? hand?.handId : null, host, view.rules.coachAllowed])
  async function send<T extends CommandType>(type: T, payload: CommandPayload<T>) {
    try {
      const result = await client.command(type, payload)
      if (type === 'room.leave') await client.forgetRoom()
      return result
    } catch (e) {
      onError(String(e))
      return undefined
    }
  }
  const act = (action: 'fold' | 'check' | 'call' | 'raise') =>
    decision &&
    send('hand.act', {
      handId: decision.handId,
      decisionId: decision.decisionId,
      legalRevision: decision.legalRevision,
      ...(decision.attemptId ? { attemptId: decision.attemptId } : {}),
      action,
      ...(action === 'raise' ? { raiseTo: raise } : {})
    })
  useHotkeys({
    f: connected && !view.paused && legal?.canFold ? () => void act('fold') : undefined,
    c:
      connected && !view.paused && (legal?.canCheck || legal?.canCall)
        ? () => void act(legal.canCheck ? 'check' : 'call')
        : undefined,
    r: connected && !view.paused && legal?.minRaiseTo !== null && legal ? () => void act('raise') : undefined
  })
  async function addAgent() {
    if (!host) return
    setBusy(true)
    try {
      let grantId = view.self.agentGrant?.grantId
      if (!grantId) {
        const ack = await send('agent.grant', { providerParticipantId: self.participantId, maxAgents: 9 })
        if (ack && 'grantId' in ack.result) grantId = ack.result.grantId
      }
      if (!grantId) throw new Error('需要房主授权此 Electron 玩家提供 AI')
      const credential = { controllerId: crypto.randomUUID(), resumeSecret: crypto.randomUUID() + crypto.randomUUID() }
      const name = personas.find((p) => p.id === template)?.name ?? template
      const created = await send('agent.create', {
        grantId,
        credential,
        profile: { name, ini: name.slice(0, 1), hue: 210, templateId: template }
      })
      if (!created) return
      await host.provideAgent({
        url: client.serverUrl,
        roomId: view.roomId,
        credential,
        templateId: template,
        buyIn: amount
      })
    } catch (e) {
      onError(String(e))
    } finally {
      setBusy(false)
    }
  }
  const rotated = Array.from(
    { length: view.rules.capacity },
    (_, i) => (i + (view.self.seatId ?? 0)) % view.rules.capacity
  )
  const seats: SeatView[] = rotated.map((seatId) => {
    const p = view.participants.find((p) => p.seatId === seatId)
    if (!p)
      return {
        name: `空位 ${seatId + 1}`,
        ini: '＋',
        hue: 0,
        tag: '',
        stack: 0,
        bet: 0,
        isDealer: false,
        isSB: false,
        isBB: false,
        folded: false,
        out: true,
        allin: false,
        thinking: false,
        winner: false,
        hasCards: false,
        status: '',
        statusTone: 'muted'
      }
    const active = hand?.actingSeatId === seatId && view.phase === 'playing'
    const equity = equities[p.participantId]
    return {
      name: p.name,
      ini: p.ini,
      hue: p.hue,
      tag: p.role === 'agent' ? 'AI' : '',
      stack: p.stack,
      bet: p.bet,
      isDealer: hand?.buttonSeatId === seatId,
      isSB: hand?.sbSeatId === seatId,
      isBB: hand?.bbSeatId === seatId,
      folded: p.folded,
      out: p.sittingOut,
      allin: p.allIn,
      thinking: active,
      winner: !!hand?.winners.some((w) => w.seatId === seatId),
      hasCards: !!p.hole,
      cards: p.hole?.some((slot) => slot.visibility === 'known')
        ? p.hole.map((slot) => (slot.visibility === 'known' ? slot.card : null))
        : undefined,
      status: !p.connected
        ? '离线'
        : p.allIn
          ? '全下'
          : p.folded
            ? '弃牌'
            : p.sittingOut
              ? '暂离'
              : active
                ? hand?.turn?.deadlineAt
                  ? `行动中 · ${Math.max(0, Math.ceil((hand.turn.deadlineAt - now) / 1000))} 秒`
                  : '思考中'
                : equity !== undefined
                  ? `胜率 ≈ ${(equity * 100).toFixed(0)}%`
                  : '',
      statusTone: p.allIn ? 'red' : active ? 'blue' : 'muted'
    }
  })
  const invite =
    client.serverUrl === 'local'
      ? ''
      : `${client.serverUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '')}/play/join/${view.roomId}`
  return (
    <>
      <div className="river-roomline">
        <span>
          好友房 <code title={view.roomId}>{view.roomId.slice(0, 8)}</code> · {view.rules.smallBlind}/
          {view.rules.bigBlind}
        </span>
        {invite ? (
          <button onClick={() => void navigator.clipboard.writeText(invite).catch(() => onError(invite))}>
            复制邀请链接
          </button>
        ) : (
          <span>本地牌局</span>
        )}
        <button onClick={() => setShowChat(!showChat)}>{showChat ? '收起公屏' : '公屏'}</button>
        <button onClick={() => setShowTools(!showTools)}>牌桌管理</button>
        {isHost && !view.started && <button onClick={() => void send('room.start', {})}>开始首手</button>}
        {host && view.rules.coachAllowed && (
          <button onClick={() => setShowCoach(!showCoach)}>{showCoach ? '收起教练' : '私有教练'}</button>
        )}
        {view.paused && <strong>已暂停</strong>}
        {!connected && <strong>连接断开，正在重连</strong>}
      </div>
      <main className="river-room">
        {showChat && (
          <ChatPanelLayout
            title="公屏"
            collapseLabel="收起"
            onCollapse={() => setShowChat(false)}
            count={view.chat.length}
            composer={
              <form
                className="river-row border-t p-3"
                onSubmit={(e: FormEvent) => {
                  e.preventDefault()
                  if (message.trim()) {
                    void send('chat.send', { text: message })
                    setMessage('')
                  }
                }}
              >
                <input
                  aria-label="公屏消息"
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="说点什么…"
                />
                <button type="submit">发送</button>
              </form>
            }
          >
            {view.chat.map((m) => {
              const p = view.participants.find((p) => p.participantId === m.senderParticipantId)
              return (
                <ChatBubble key={m.messageId} name={m.senderName} ini={p?.ini ?? m.senderName.slice(0, 1)} hue={p?.hue}>
                  {m.text}
                </ChatBubble>
              )
            })}
            {!view.chat.length && <span className="text-[13px] text-muted-foreground">还没有人发言。</span>}
          </ChatPanelLayout>
        )}
        <section className="river-play">
          <div className="river-table-stage" aria-label="牌桌">
            <TableStage
              seats={seats}
              board={hand?.board ?? []}
              pot={hand?.pot ?? 0}
              done={view.phase === 'showing' || view.phase === 'closed'}
              handNo={hand?.number ?? 0}
              heroSeat={view.self.seatId === null ? null : 0}
              heroTurn={!!decision}
              felt={feltOf(appearance)}
              back={appearance.back}
              fx={appearance.fx}
              labels={{ pot: '底池', sb: '小盲', bb: '大盲' }}
            >
              <div className="absolute top-3 left-4 z-10 flex max-w-[60%] flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                <span>
                  第 {hand?.number ?? 0} 手 · {view.phase === 'waiting' ? '等待开局' : hand?.street}
                </span>
                {hand && hand.pots.length > 1 && (
                  <span>{hand.pots.map((pot, i) => `${i ? '边' : '主'}池 ${number(pot.amount)}`).join(' · ')}</span>
                )}
                {hand?.turn?.state === 'blocked' && <span className="text-lose">AI 等待房主处理</span>}
              </div>
              <details className="absolute top-3 right-4 z-20 text-[13px]">
                <summary className="cursor-pointer rounded-full border bg-white px-3 py-1">桌面外观</summary>
                <div className="mt-2 flex w-[220px] flex-col gap-3 rounded-[14px] border bg-white p-4 shadow-xl">
                  <span className="text-xs text-muted-foreground">桌布</span>
                  <div className="flex gap-2">
                    {FELTS.map((f) => (
                      <button
                        key={f.k}
                        aria-label={`桌布 ${f.k}`}
                        onClick={() => setAppearance({ ...appearance, felt: f.k })}
                        className="size-[26px] rounded-full"
                        style={{
                          background: f.felt,
                          boxShadow: appearance.felt === f.k ? '0 0 0 2px #fff, 0 0 0 4px #1d1d1f' : '0 0 0 1px #0003'
                        }}
                      />
                    ))}
                  </div>
                  <label>
                    牌背
                    <select
                      value={appearance.back}
                      onChange={(e) => setAppearance({ ...appearance, back: e.target.value as Back })}
                    >
                      {BACKS.map((b) => (
                        <option key={b.k}>{b.k}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    动效
                    <select
                      value={appearance.fx}
                      onChange={(e) => setAppearance({ ...appearance, fx: e.target.value as Fx })}
                    >
                      <option value="full">完整</option>
                      <option value="lite">轻量</option>
                      <option value="off">关闭</option>
                    </select>
                  </label>
                </div>
              </details>
            </TableStage>
          </div>
          <div className="river-actions">
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <span>
                {self.name} · 可用 {number(self.stack)}
                {self.pendingStack ? ` / 下手 ${number(self.pendingStack)}` : ''}
              </span>
              {self.seatId === null && (
                <>
                  <span>选择空位入座</span>
                  {rotated
                    .filter((seatId) => !view.participants.some((p) => p.seatId === seatId))
                    .map((seatId) => (
                      <button key={seatId} onClick={() => void send('seat.sit', { seatId })}>
                        座位 {seatId + 1}
                      </button>
                    ))}
                </>
              )}
            </div>
            {decision && legal ? (
              <ActionControls
                canAct={connected && !view.paused}
                canRaise={connected && !view.paused && legal.minRaiseTo !== null}
                draft={String(raise)}
                isAllIn={raise === legal.maxRaiseTo}
                canFold={legal.canFold}
                canCall={legal.canCheck || legal.canCall}
                foldLabel="弃牌"
                callLabel={legal.canCheck ? '过牌' : `跟注 ${number(legal.payableToCall)}`}
                raiseLabel={raise === legal.maxRaiseTo ? '全下' : '加注到'}
                onFold={() => {
                  if (legal.canFold) void act('fold')
                }}
                onCall={() => {
                  if (legal.canCheck || legal.canCall) void act(legal.canCheck ? 'check' : 'call')
                }}
                onRaise={() => void act('raise')}
                onStep={(direction) =>
                  setRaise(
                    Math.max(
                      legal.minRaiseTo ?? 0,
                      Math.min(legal.maxRaiseTo ?? 0, raise + direction * view.rules.bigBlind)
                    )
                  )
                }
                onDraft={(value) => {
                  const next = Number(value.replace(/[,\s]/g, ''))
                  if (Number.isFinite(next)) setRaise(Math.round(next))
                }}
                onCommit={() => setRaise(Math.max(legal.minRaiseTo ?? 0, Math.min(legal.maxRaiseTo ?? 0, raise)))}
              />
            ) : (
              <div className="river-preactions">
                {view.phase === 'playing' &&
                  self.hole &&
                  !self.folded &&
                  !self.allIn &&
                  (['check', 'fold', 'checkOrFold'] as const).map((action) => (
                    <button
                      key={action}
                      className={view.self.preAction?.action === action ? 'selected' : ''}
                      onClick={() =>
                        void send(
                          view.self.preAction?.action === action ? 'preaction.clear' : 'preaction.set',
                          view.self.preAction?.action === action
                            ? {}
                            : { handId: hand!.handId, street: hand!.street as 'preflop', action }
                        )
                      }
                    >
                      预约{action === 'check' ? '过牌' : action === 'fold' ? '弃牌' : '过牌/弃牌'}
                    </button>
                  ))}
              </div>
            )}
            {view.phase === 'showing' && hand && (
              <div className="river-row">
                <span>亮牌</span>
                <button onClick={() => void send('hand.reveal', { handId: hand.handId, slots: [0] })}>第一张</button>
                <button onClick={() => void send('hand.reveal', { handId: hand.handId, slots: [1] })}>第二张</button>
                <button onClick={() => void send('hand.reveal', { handId: hand.handId, slots: [0, 1] })}>两张</button>
                <small>不操作则不亮牌</small>
              </div>
            )}
          </div>
          {view.phase === 'closed' && (
            <div className="river-panel">
              本场已结束。
              {view.closed?.outcome === 'terminated' ? '未结算投入单独记入中止记录。' : '战绩已保存在本地。'}
              <button onClick={() => void client.forgetRoom()}>返回大厅</button>
            </div>
          )}
        </section>
        {showTools && (
          <aside className="river-room-tools">
            <button className="self-end" onClick={() => setShowTools(false)}>
              收起管理
            </button>
            <section className="river-panel">
              <h2>牌桌操作</h2>
              <div className="river-row">
                <input
                  aria-label="买卖筹码数"
                  type="number"
                  min="1"
                  max="1000000000"
                  value={amount}
                  onChange={(e) => setAmount(+e.target.value)}
                />
                <button onClick={() => void send('funds.buyIn', { amount })}>买入</button>
                <button onClick={() => void send('funds.cashOut', { amount, source: 'stack' })}>卖出</button>
              </div>
              {self.pendingStack > 0 && (
                <button onClick={() => void send('funds.cashOut', { amount: self.pendingStack, source: 'pending' })}>
                  取回下手筹码
                </button>
              )}
              <div className="river-row">
                <button onClick={() => void send('seat.sitOut', { enabled: !self.sittingOut })}>
                  {self.sittingOut ? '回来' : '下手暂离'}
                </button>
                <button onClick={() => void send('seat.stand', { when: 'now' })}>离座观战</button>
                <button onClick={() => void send('room.leave', {})}>离开房间</button>
              </div>
              {isHost && (
                <>
                  <div className="river-row">
                    {!view.started && (
                      <button className="river-primary" onClick={() => void send('room.start', {})}>
                        开始首手
                      </button>
                    )}
                    <button onClick={() => void send(view.paused ? 'room.resume' : 'room.pause', {})}>
                      {view.paused ? '恢复' : '暂停'}
                    </button>
                    {view.phase === 'showing' && hand && (
                      <button onClick={() => void send('hand.skipShowing', { handId: hand.handId })}>下一手</button>
                    )}
                    <button onClick={() => void send('room.close', {})}>散桌</button>
                  </div>
                  {hand?.turn?.state === 'blocked' && (
                    <button onClick={() => void send('decision.retry', { decisionId: hand.turn!.decisionId })}>
                      重试 AI
                    </button>
                  )}
                  <details>
                    <summary>房间设置与玩家</summary>
                    <RuleToggles rules={nextRules} onChange={setNextRules} />
                    <button
                      disabled={view.phase !== 'waiting'}
                      onClick={() => void send('room.rules', { rules: nextRules })}
                    >
                      手间应用设置
                    </button>
                    {view.participants
                      .filter((p) => p.participantId !== self.participantId)
                      .map((p) => (
                        <div className="river-member" key={p.participantId}>
                          <span>{p.name}</span>
                          {p.role === 'human' && (
                            <>
                              <button
                                onClick={() => void send('host.transfer', { targetParticipantId: p.participantId })}
                              >
                                转让
                              </button>
                              <button
                                onClick={() =>
                                  void send('agent.grant', { providerParticipantId: p.participantId, maxAgents: 9 })
                                }
                              >
                                授权 AI
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => void send('participant.remove', { targetParticipantId: p.participantId })}
                          >
                            移除
                          </button>
                        </div>
                      ))}
                  </details>
                </>
              )}
              {host && (isHost || view.self.agentGrant) && (
                <div className="river-row">
                  <select aria-label="AI 角色" value={template} onChange={(e) => setTemplate(e.target.value)}>
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button disabled={busy || !template} onClick={() => void addAgent()}>
                    添加本机 AI
                  </button>
                </div>
              )}
            </section>
          </aside>
        )}
        {host && view.rules.coachAllowed && showCoach && (
          <aside className="river-coach-panel">
            {' '}
            {host && view.rules.coachAllowed && (
              <details className="river-panel" open>
                <summary>私有教练</summary>
                <p className="river-coach">
                  <RichText text={coach || '轮到你时，教练会根据你的视图讲解。'} />
                </p>
                <form
                  className="river-row"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (!question.trim()) return
                    setCoach('教练思考中…')
                    void host.coach(view, question).then(setCoach, (error) => setCoach(String(error)))
                    setQuestion('')
                  }}
                >
                  <input
                    aria-label="向私有教练提问"
                    maxLength={1000}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="问问教练…"
                  />
                  <button type="submit">提问</button>
                </form>
              </details>
            )}
          </aside>
        )}
      </main>
    </>
  )
}

function History({ store }: { store: KeyValueStore }) {
  const [rooms, setRooms] = useState<PersonalRoomSummary[]>([])
  const [hands, setHands] = useState<PersonalHandRecord[]>([])
  useEffect(() => {
    void store.entries<PersonalRoomSummary>('summary:').then(setRooms)
    void store.entries<PersonalHandRecord>('hand:').then(setHands)
  }, [store])
  const ordered = rooms.slice().sort((a, b) => a.startedAt - b.startedAt)
  let total = 0
  const points = ordered
    .map(
      (room, i) =>
        `${ordered.length < 2 ? 0 : (i * 600) / (ordered.length - 1)},${100 - (((total += room.actualNet ?? room.settledNet) / Math.max(1, ...rooms.map((r) => Math.abs(r.actualNet ?? r.settledNet)))) * 60) / Math.max(1, rooms.length)}`
    )
    .join(' ')
  return (
    <main className="river-history">
      <h1>本地战绩</h1>
      <p>
        累计买入 {number(rooms.reduce((sum, r) => sum + r.buyInTotal, 0))} · 已结算盈亏{' '}
        {number(rooms.reduce((sum, r) => sum + r.settledNet, 0))}
      </p>
      {ordered.length > 0 && (
        <svg viewBox="0 0 600 180" role="img" aria-label="按场次累计盈亏趋势">
          <line x1="0" y1="100" x2="600" y2="100" stroke="#ddd" />
          <polyline points={points} fill="none" stroke="var(--foreground)" strokeWidth="3" />
        </svg>
      )}
      {rooms
        .slice()
        .reverse()
        .map((r) => (
          <details className="river-panel" key={`${r.roomId}:${r.participantId}`}>
            <summary>
              {new Date(r.startedAt).toLocaleString()} · 买入 {number(r.buyInTotal)} · 盈亏{' '}
              {number(r.actualNet ?? r.settledNet)} · {r.handsWon}/{r.handsLost}/{r.handsTied} 胜/负/平
            </summary>
            {r.abandonedContribution > 0 && <p>中止投入 {number(r.abandonedContribution)}</p>}
            {hands
              .filter((h) => h.roomId === r.roomId && h.viewerParticipantId === r.participantId)
              .map((hand) => (
                <details key={hand.handId}>
                  <summary>
                    第 {hand.handNumber} 手 · 净收益 {number(hand.ownNet ?? 0)}
                  </summary>
                  <div className="river-cards">
                    {hand.board.map((card) => (
                      <MiniCard key={card} card={card} />
                    ))}
                  </div>
                  {hand.players.map((p) => (
                    <p key={p.participantId}>
                      {p.name} · {p.net === null ? '—' : number(p.net)}{' '}
                      {p.hole.map((slot, i) =>
                        slot.visibility === 'known' ? <MiniCard key={i} card={slot.card} /> : ' ▩ '
                      )}
                    </p>
                  ))}
                  <ol>
                    {hand.publicActions.map((a) => (
                      <li key={a.id}>
                        #{a.seatId + 1} {a.street} {a.action} {a.paidDelta || ''}
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
          </details>
        ))}
    </main>
  )
}
