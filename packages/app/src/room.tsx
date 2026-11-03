import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from 'react'
import {
  ActionControls,
  AppearancePopover,
  CardBack,
  ChatBubble,
  ChatPanelLayout,
  PlayingCard,
  RichText,
  TableStage,
  feltOf,
  useHotkeys,
  type AppearanceValue,
  type DealCard,
  type SeatView
} from '@river/ui'
import type { RiverClient } from '@river/client'
import type { CommandPayload, CommandType, Effect, ParticipantView, RoomView } from '@river/protocol'
import type { DesktopHost } from './host'
import type { Locale, WebText } from './text'
import { actionWords, streets } from './text'
import type { TableAudio } from './audio'
import { number } from './format'
import { RoomPanel } from './room-panel'
import { IconBack, IconChat, IconLink, IconMuted, IconSend, IconUsers, IconVolume } from './icons'
import { cx, field, ghost, pill, primary } from './ui'

type Send = <T extends CommandType>(type: T, payload: CommandPayload<T>) => Promise<unknown>

type Feed =
  | { id: string; at: number; kind: 'system'; text: string }
  | { id: string; at: number; kind: 'action'; name: string; text: string }

const floating =
  'flex items-center gap-2 rounded-full border border-input bg-white px-3 py-1.5 text-[13px] whitespace-nowrap shadow-[0_4px_14px_rgba(0,0,0,0.05)]'

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatch(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return match
}

function effectFeed(effect: Effect, view: RoomView, locale: Locale, text: WebText): Feed | null {
  const nameOf = (participantId: string) =>
    view.participants.find((p) => p.participantId === participantId)?.name ?? ''
  switch (effect.type) {
    case 'actionApplied': {
      const player = view.participants.find((p) => p.seatId === effect.data.seatId)
      const word = actionWords[locale][effect.data.action]
      const amount =
        effect.data.action === 'raise'
          ? number(effect.data.raiseTo ?? 0, locale)
          : effect.data.action === 'call'
            ? number(effect.data.paidDelta, locale)
            : ''
      return {
        id: effect.id,
        at: effect.at,
        kind: 'action',
        name: player?.name ?? text.room.seat(effect.data.seatId + 1),
        text: `${word}${amount ? ` ${amount}` : ''}`
      }
    }
    case 'participantChanged': {
      const name = nameOf(effect.data.participantId)
      if (effect.data.change === 'joined') {
        return { id: effect.id, at: effect.at, kind: 'system', text: text.room.feed.joined(name) }
      }
      if (effect.data.change === 'removed') {
        return { id: effect.id, at: effect.at, kind: 'system', text: text.room.feed.left(name) }
      }
      return null
    }
    case 'fundsChanged': {
      const name = nameOf(effect.data.participantId)
      const amount = number(effect.data.amount, locale)
      return {
        id: effect.id,
        at: effect.at,
        kind: 'system',
        text:
          effect.data.direction === 'buyIn'
            ? text.room.feed.buyIn(name, amount)
            : text.room.feed.cashOut(name, amount)
      }
    }
    case 'roomPaused':
      return {
        id: effect.id,
        at: effect.at,
        kind: 'system',
        text: effect.data.paused ? text.room.feed.paused : text.room.feed.resumed
      }
    case 'handSettled':
      return { id: effect.id, at: effect.at, kind: 'system', text: text.room.feed.handEnd }
    case 'holeRevealed':
      return {
        id: effect.id,
        at: effect.at,
        kind: 'system',
        text: text.room.feed.reveal(nameOf(effect.data.participantId))
      }
    default:
      return null
  }
}

export function Room({
  client,
  view,
  effects,
  connected,
  host,
  locale,
  text,
  appearance,
  onAppearance,
  sound,
  onSound,
  audio,
  onError,
  onBack
}: {
  client: RiverClient
  view: RoomView
  effects: Effect[]
  connected: boolean
  host?: DesktopHost
  locale: Locale
  text: WebText
  appearance: AppearanceValue
  onAppearance(value: AppearanceValue): void
  sound: boolean
  onSound(value: boolean): void
  audio: TableAudio
  onError(message: string): void
  onBack(): void
}) {
  const narrow = useMedia('(max-width: 900px)')
  const phone = useMedia('(max-width: 600px)')
  const [showChat, setShowChat] = useState(() => window.innerWidth >= 1100)
  const [showCoach, setShowCoach] = useState(() => window.innerWidth >= 1000)
  const [showPanel, setShowPanel] = useState(false)
  const [showAppearance, setShowAppearance] = useState(false)
  const [raise, setRaise] = useState(view.rules.bigBlind * 2)
  const [draft, setDraft] = useState(String(view.rules.bigBlind * 2))
  const [message, setMessage] = useState('')
  const [question, setQuestion] = useState('')
  const [coachText, setCoachText] = useState('')
  const [busy, setBusy] = useState(false)
  const [personas, setPersonas] = useState<Array<{ id: string; name: string }>>([])
  const [equities, setEquities] = useState<Record<string, number>>({})
  const [feed, setFeed] = useState<Feed[]>([])
  const [picked, setPicked] = useState<number[]>([])
  const [revealed, setRevealed] = useState<number[]>([])
  const [dismissedReveal, setDismissedReveal] = useState(false)
  const [sendingReveal, setSendingReveal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(Date.now())
  const seenEffects = useRef(new Set<string>())

  const self = view.participants.find((p) => p.participantId === view.self.participantId)!
  const isHost = view.hostId === self.participantId
  const hand = view.hand
  const decision = hand?.decision
  const legal = decision?.legal

  useEffect(() => {
    if (narrow) {
      setShowChat(false)
      setShowCoach(false)
      setShowPanel(false)
    }
  }, [narrow])

  useEffect(() => {
    setFeed([])
    setPicked([])
    setRevealed([])
    setDismissedReveal(false)
    seenEffects.current.clear()
  }, [view.roomId])

  const deadline = hand?.turn?.deadlineAt ?? hand?.showingEndsAt ?? null
  useEffect(() => {
    if (deadline === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [deadline])

  const equityKey = hand
    ? `${hand.handId}:${hand.board.join(',')}:${view.participants
        .map(
          (p) =>
            `${p.participantId}:${p.totalIn}:${p.folded}:${p.hole
              ?.map((slot) => (slot.visibility === 'known' ? slot.card : '?'))
              .join('')}`
        )
        .join('|')}`
    : ''
  useEffect(() => {
    if (!hand) {
      setEquities({})
      return
    }
    const worker = new Worker(new URL('./equity-worker.ts', import.meta.url), { type: 'module' })
    setEquities({})
    worker.onmessage = (event) => setEquities(event.data as Record<string, number>)
    worker.postMessage(view)
    return () => worker.terminate()
  }, [equityKey])

  useEffect(() => {
    if (!effects.length) return
    const next = effects
      .map((effect) => effectFeed(effect, view, locale, text))
      .filter((item): item is Feed => !!item && !seenEffects.current.has(item.id))
    if (!next.length) return
    for (const item of next) seenEffects.current.add(item.id)
    setFeed((previous) => [...previous, ...next].slice(-60))
  }, [effects, locale, text, view])

  useEffect(() => {
    if (!hand?.handId) return
    const current = hand
    const id = `hand:${current.handId}`
    if (seenEffects.current.has(id)) return
    seenEffects.current.add(id)
    setFeed((previous) => {
      const entry: Feed = {
        id,
        at: Date.now(),
        kind: 'system',
        text: text.room.feed.handStart(current.number)
      }
      return [...previous, entry].slice(-60)
    })
  }, [hand?.handId, hand?.number, text])

  useEffect(() => {
    if (!host) return
    void host.personas().then((items) => setPersonas(items))
  }, [host])

  useEffect(() => {
    let current = true
    if (host && view.rules.coachAllowed && (decision || view.phase === 'showing')) {
      setCoachText(text.room.coachThinking)
      void host.coach(view).then(
        (value) => {
          if (current) setCoachText(value)
        },
        (error) => {
          if (current) setCoachText(String(error))
        }
      )
    }
    return () => {
      current = false
    }
  }, [decision?.decisionId, view.phase === 'showing' ? hand?.handId : null, host, view.rules.coachAllowed])

  useEffect(() => {
    if (!showAppearance) return
    const close = (event: MouseEvent) => {
      if (!(event.target as Element).closest('[data-felt-popover]')) setShowAppearance(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [showAppearance])

  const dealEffects = effects
    .filter((effect) => effect.type === 'deal')
    .sort((a, b) => a.data.order - b.data.order)
  const dealOrder: DealCard[] | undefined = dealEffects.length
    ? dealEffects.map((effect) => ({
        seat:
          (effect.data.seatId - (view.self.seatId ?? 0) + view.rules.capacity) % view.rules.capacity,
        round: effect.data.slot
      }))
    : undefined
  const dealId = dealEffects.length ? dealEffects.map((effect) => effect.id).join(':') : null

  useEffect(() => {
    if (dealEffects.length) return
    if (effects.some((effect) => effect.type === 'boardDealt')) audio.play('place')
    else if (effects.some((effect) => effect.type === 'actionApplied' || effect.type === 'fundsChanged'))
      audio.play('chips')
  }, [effects])

  useEffect(() => {
    if (legal?.minRaiseTo !== null && legal?.minRaiseTo !== undefined) {
      const next = clamp(legal.minRaiseTo)
      setRaise(next)
      setDraft(String(next))
    }
  }, [legal?.minRaiseTo, decision?.decisionId])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  useEffect(() => {
    setPicked([])
    setRevealed([])
    setDismissedReveal(false)
  }, [hand?.handId])

  const clamp = (value: number) => {
    if (!legal) return value
    const min = legal.minRaiseTo ?? 0
    const max = legal.maxRaiseTo ?? value
    return Math.max(min, Math.min(max, Math.round(value)))
  }

  async function send<T extends CommandType>(type: T, payload: CommandPayload<T>) {
    try {
      const result = await client.command(type, payload)
      onError('')
      return result
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
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
      ...(action === 'raise' ? { raiseTo: clamp(raise) } : {})
    })

  useHotkeys({
    f: connected && !view.paused && legal?.canFold ? () => void act('fold') : undefined,
    c:
      connected && !view.paused && (legal?.canCheck || legal?.canCall)
        ? () => void act(legal.canCheck ? 'check' : 'call')
        : undefined,
    r: connected && !view.paused && legal?.minRaiseTo !== null && legal ? () => void act('raise') : undefined
  })

  const seconds = (at: number | null) =>
    at === null ? null : Math.max(0, Math.ceil((at - now) / 1000))
  const turnSeconds = seconds(hand?.turn?.deadlineAt ?? null)
  const showingSeconds = seconds(hand?.showingEndsAt ?? null)
  const winnerBySeat = new Map((hand?.winners ?? []).map((winner) => [winner.seatId, winner.amount]))
  const rotated = Array.from(
    { length: view.rules.capacity },
    (_, index) => (index + (view.self.seatId ?? 0)) % view.rules.capacity
  )
  const seats: SeatView[] = rotated.map((seatId) => {
    const player = view.participants.find((p) => p.seatId === seatId)
    if (!player)
      return {
        name: String(seatId + 1),
        ini: '',
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
        statusTone: 'muted',
        empty: true
      }
    const active = hand?.actingSeatId === seatId && view.phase === 'playing'
    const equity = equities[player.participantId]
    const status = !player.connected
      ? text.room.offline
      : player.allIn
        ? text.room.turn.allIn
        : player.folded
          ? text.room.turn.folded
          : player.sittingOut
            ? text.room.turn.sittingOut
            : active
              ? text.room.turn.acting(turnSeconds)
              : equity !== undefined
                ? text.room.equity(Math.round(equity * 100))
                : ''
    return {
      name: player.name,
      ini: player.ini,
      hue: player.hue,
      tag: player.role === 'agent' ? 'AI' : '',
      stack: player.stack,
      bet: player.bet,
      isDealer: hand?.buttonSeatId === seatId,
      isSB: hand?.sbSeatId === seatId,
      isBB: hand?.bbSeatId === seatId,
      folded: player.folded,
      out: player.sittingOut,
      allin: player.allIn,
      thinking: active,
      winner: winnerBySeat.has(seatId),
      hasCards: !!player.hole,
      cards: player.hole?.some((slot) => slot.visibility === 'known')
        ? player.hole.map((slot) => (slot.visibility === 'known' ? slot.card : null))
        : undefined,
      status,
      statusTone: player.allIn ? 'red' : active ? 'blue' : winnerBySeat.has(seatId) ? 'green' : 'muted'
    }
  })

  const invite =
    client.serverUrl === 'local'
      ? ''
      : `${client.serverUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '')}/play/join/${view.roomId}`
  const copy = async () => {
    if (!invite) return
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
    } catch {
      onError(invite)
    }
  }
  const leave = async () => {
    if (!window.confirm(text.room.leaveConfirm)) return
    await send('room.leave', {})
    onBack()
  }
  const addAgent = async (buyIn: number, templateId: string) => {
    if (!host) return
    setBusy(true)
    try {
      let grantId = view.self.agentGrant?.grantId
      if (!grantId) {
        const ack = await send('agent.grant', {
          providerParticipantId: self.participantId,
          maxAgents: 9
        })
        if (ack && 'grantId' in ack.result) grantId = ack.result.grantId
      }
      if (!grantId) throw new Error(locale === 'zh' ? '需要房主授权此玩家提供 AI' : 'The host must allow this player to provide AI')
      const credential = {
        controllerId: crypto.randomUUID(),
        resumeSecret: crypto.randomUUID() + crypto.randomUUID()
      }
      const name = personas.find((persona) => persona.id === templateId)?.name ?? templateId
      const created = await send('agent.create', {
        grantId,
        credential,
        profile: { name, ini: name.slice(0, 1), hue: 210, templateId }
      })
      if (!created) return
      await host.provideAgent({
        url: client.serverUrl,
        roomId: view.roomId,
        credential,
        templateId,
        buyIn
      })
    } catch (error) {
      onError(String(error))
    } finally {
      setBusy(false)
    }
  }

  const status =
    !connected
      ? text.status.reconnecting
      : view.paused
        ? text.room.paused
        : decision
          ? text.room.turn.yours(turnSeconds)
          : hand?.turn
            ? text.room.waitingFor(
                view.participants.find((p) => p.seatId === hand.turn!.seatId)?.name ?? '',
                turnSeconds
              )
            : view.phase === 'showing'
              ? text.room.showing(showingSeconds)
              : !view.started
                ? text.room.waitingHost
                : text.room.waiting

  const pre = view.self.preAction && hand && view.self.preAction.handId === hand.handId ? view.self.preAction : null
  const preActions = ['check', 'fold', 'checkOrFold'] as const
  const preLabel = (action: (typeof preActions)[number]) =>
    action === 'check' ? text.room.pre.check : action === 'fold' ? text.room.pre.fold : text.room.pre.checkOrFold
  const canPreaction =
    !!hand &&
    view.phase === 'playing' &&
    !!self.hole &&
    !self.folded &&
    !self.allIn &&
    hand.street !== 'showdown' &&
    !decision

  const presets = (() => {
    if (!legal || legal.minRaiseTo === null || legal.maxRaiseTo === null) return []
    const values = [legal.minRaiseTo, legal.minRaiseTo + view.rules.bigBlind, legal.maxRaiseTo]
    return [...new Set(values.map(clamp))].map((value) => ({
      value,
      label:
        value === legal.maxRaiseTo
          ? text.room.action.allIn
          : value === legal.minRaiseTo
            ? text.room.action.min
            : text.room.action.plusBB
    }))
  })()

  const chatEntries = [
    ...feed.map((item) => ({ kind: item.kind, at: item.at, item })),
    ...view.chat.map((message) => ({
      kind: 'chat' as const,
      at: message.serverAt,
      item: message
    }))
  ].sort((a, b) => a.at - b.at)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b bg-background px-3 py-2 text-[13px] md:px-4">
        <button
          className="flex size-7 items-center justify-center rounded-full text-label hover:bg-accent"
          onClick={() => void leave()}
          aria-label={text.room.back}
          title={text.room.back}
        >
          <IconBack />
        </button>
        <span className="font-semibold">
          {text.room.room} <code className="font-normal text-muted-foreground">{view.roomId.slice(0, 8)}</code>
        </span>
        <span className="text-muted-foreground">
          {view.rules.smallBlind}/{view.rules.bigBlind}
        </span>
        {view.paused && (
          <span className="rounded-full bg-[oklch(0.97_0.02_25)] px-2.5 py-0.5 text-xs font-medium text-lose">
            {text.room.paused}
          </span>
        )}
        {!connected && (
          <span className="rounded-full bg-[oklch(0.97_0.02_25)] px-2.5 py-0.5 text-xs font-medium text-lose">
            {text.status.reconnecting}
          </span>
        )}
        <div className="flex-1" />
        {invite ? (
          <button className={pill} onClick={() => void copy()}>
            <IconLink />
            {copied ? text.room.inviteCopied : text.room.invite}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{text.room.local}</span>
        )}
        <button className={pill} onClick={() => setShowChat((value) => !value)} aria-label={text.room.chat}>
          <IconChat />
          <span className="hidden sm:inline">{text.room.chat}</span>
        </button>
        <button className={pill} onClick={() => setShowPanel((value) => !value)} aria-label={text.room.panel}>
          <IconUsers />
          <span className="hidden sm:inline">{text.room.panel}</span>
        </button>
        {host && view.rules.coachAllowed && (
          <button className={pill} onClick={() => setShowCoach((value) => !value)}>
            {text.room.coachTitle}
          </button>
        )}
        {isHost && !view.started && (
          <button className={primary} onClick={() => void send('room.start', {})}>
            {text.room.start}
          </button>
        )}
      </div>

      <main className="river-room relative flex min-h-0 flex-1">
        {showChat && (
          <ChatPanelLayout
            title={text.room.chatTitle}
            collapseLabel={text.common.collapse}
            onCollapse={() => setShowChat(false)}
            count={chatEntries.length}
            composer={
              <form
                className="flex gap-2 border-t p-3"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault()
                  if (!message.trim()) return
                  void send('chat.send', { text: message })
                  setMessage('')
                }}
              >
                <input
                  aria-label={text.room.chatTitle}
                  className={field}
                  maxLength={500}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={text.room.chatPlaceholder}
                />
                <button
                  type="submit"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-foreground text-white disabled:opacity-40"
                  disabled={!connected || !message.trim()}
                  aria-label={text.room.send}
                >
                  <IconSend />
                </button>
              </form>
            }
          >
            {chatEntries.map((entry) =>
              entry.kind === 'chat' ? (
                <ChatBubble
                  key={entry.item.messageId}
                  name={entry.item.senderName}
                  ini={
                    view.participants.find((p) => p.participantId === entry.item.senderParticipantId)?.ini ??
                    entry.item.senderName.slice(0, 1)
                  }
                  hue={view.participants.find((p) => p.participantId === entry.item.senderParticipantId)?.hue}
                >
                  {entry.item.text}
                </ChatBubble>
              ) : entry.item.kind === 'system' ? (
                <div key={entry.item.id} className="flex items-center justify-center gap-1.5 text-xs text-[#a1a1a6]">
                  — {entry.item.text} —
                </div>
              ) : (
                <div key={entry.item.id} className="flex items-center gap-1.5 pl-[38px] text-xs text-muted-foreground">
                  <span className="font-semibold text-label">{entry.item.name}</span>
                  <span>{entry.item.text}</span>
                </div>
              )
            )}
            {!chatEntries.length && (
              <span className="text-[13px] text-muted-foreground">{text.room.chatEmpty}</span>
            )}
          </ChatPanelLayout>
        )}

        {narrow && (showChat || showCoach) && (
          <div
            className="river-scrim"
            style={{ zIndex: 20 }}
            onClick={() => {
              setShowChat(false)
              setShowCoach(false)
            }}
          />
        )}

        <section className="river-play flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
          <div className="river-table-stage flex min-h-[560px] flex-1">
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
              labels={{ pot: text.room.pot, sb: text.room.sb, bb: text.room.bb }}
              dealId={dealId}
              dealOrder={dealOrder}
              onDealStart={(count) => audio.deal(count)}
              compact={phone}
            >
              <div className="pointer-events-none absolute inset-0 z-10">
                <div className="absolute top-3 left-4 flex max-w-[60%] flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                  <span className="rounded-full bg-white/90 px-3 py-1 shadow-sm">
                    {hand ? `${text.room.hand(hand.number)} · ${streets[locale][hand.street]}` : text.room.waiting}
                  </span>
                  {hand && hand.pots.length > 1 && (
                    <span className="rounded-full bg-white/90 px-2.5 py-1">
                      {hand.pots
                        .map((pot, index) =>
                          `${index === 0 ? text.room.pot : `${text.room.pot} ${index + 1}`} ${number(pot.amount, locale)}`
                        )
                        .join(' · ')}
                    </span>
                  )}
                  {hand?.turn?.state === 'blocked' && <span className="text-lose">{text.room.aiBlocked}</span>}
                  {view.self.viewMode === 'spectator' && view.rules.spectatorVision && (
                    <span className="rounded-full bg-white/90 px-2.5 py-1">{text.room.spectator}</span>
                  )}
                </div>
                <div
                  data-felt-popover
                  className="pointer-events-auto absolute top-3 right-4 z-20 flex flex-col items-end gap-2"
                >
                  <div className="flex gap-2">
                    <button
                      className={floating}
                      onClick={() => onSound(!sound)}
                      aria-pressed={!sound}
                      title={sound ? text.room.mute : text.room.unmute}
                      aria-label={sound ? text.room.mute : text.room.unmute}
                    >
                      {sound ? <IconVolume /> : <IconMuted />}
                    </button>
                    <button className={floating} onClick={() => setShowAppearance((value) => !value)}>
                      {text.room.appearance}
                    </button>
                  </div>
                  {showAppearance && (
                    <AppearancePopover
                      value={appearance}
                      onChange={onAppearance}
                      labels={{
                        felt: text.appearance.felt,
                        back: text.appearance.back,
                        fx: text.appearance.fx,
                        custom: text.appearance.custom,
                        fxOpts: text.appearance.fxOpts
                      }}
                    />
                  )}
                </div>
              </div>
            </TableStage>
          </div>

          <div className="river-actions sticky bottom-0 z-[12] flex shrink-0 flex-col gap-3 border-t bg-[#fbfbfa] px-4 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
            {view.phase === 'closed' ? (
              <div className="flex flex-wrap items-center gap-3 rounded-[14px] border bg-white px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{text.room.closed.title}</div>
                  <div className="text-[13px] text-muted-foreground">
                    {view.closed?.outcome === 'terminated'
                      ? text.room.closed.terminated
                      : text.room.closed.settled}
                  </div>
                </div>
                <button className={primary} onClick={onBack}>
                  {text.room.closed.back}
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {presets.map((preset) => (
                    <button
                      key={preset.value}
                      className={cx(
                        'rounded-lg border border-input px-3 py-[5px] text-[13px] whitespace-nowrap',
                        raise === preset.value ? 'bg-[#ececea] font-semibold' : 'bg-white'
                      )}
                      onClick={() => {
                        setRaise(preset.value)
                        setDraft(String(preset.value))
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <div className="flex-1" />
                  <span
                    className={cx(
                      'text-[13px] whitespace-nowrap',
                      decision && !view.paused ? 'text-blue' : 'text-muted-foreground'
                    )}
                  >
                    {status}
                  </span>
                </div>

                {decision && legal ? (
                  <ActionControls
                    canAct={connected && !view.paused}
                    canRaise={connected && !view.paused && legal.minRaiseTo !== null}
                    draft={draft}
                    isAllIn={legal.maxRaiseTo !== null && raise >= legal.maxRaiseTo}
                    canFold={legal.canFold}
                    canCall={legal.canCheck || legal.canCall}
                    foldLabel={text.room.action.fold}
                    callLabel={
                      legal.canCheck
                        ? text.room.action.check
                        : text.room.action.call(number(legal.payableToCall, locale))
                    }
                    raiseLabel={
                      legal.maxRaiseTo !== null && raise >= legal.maxRaiseTo
                        ? text.room.action.allIn
                        : text.room.action.raiseTo
                    }
                    onFold={() => {
                      if (legal.canFold) void act('fold')
                    }}
                    onCall={() => {
                      if (legal.canCheck || legal.canCall) void act(legal.canCheck ? 'check' : 'call')
                    }}
                    onRaise={() => void act('raise')}
                    onStep={(direction) => {
                      const next = clamp(raise + direction * view.rules.bigBlind)
                      setRaise(next)
                      setDraft(String(next))
                    }}
                    onDraft={(value) => {
                      setDraft(value)
                      const next = Number(value.replace(/[,\s]/g, ''))
                      if (Number.isFinite(next)) setRaise(next)
                    }}
                    onCommit={() => {
                      const next = clamp(raise)
                      setRaise(next)
                      setDraft(String(next))
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur()
                      else if (event.key === 'Escape') event.currentTarget.blur()
                    }}
                  />
                ) : (
                  <>
                    {self.seatId === null && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-muted-foreground">{text.room.chooseSeat}</span>
                        {rotated
                          .filter((seatId) => !view.participants.some((p) => p.seatId === seatId))
                          .map((seatId) => (
                            <button
                              key={seatId}
                              className={pill}
                              onClick={() => void send('seat.sit', { seatId })}
                            >
                              {text.room.seat(seatId + 1)}
                            </button>
                          ))}
                      </div>
                    )}
                    {canPreaction && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] text-label">{text.room.pre.title}</span>
                          {preActions.map((action) => {
                            const selected = pre?.action === action
                            return (
                              <button
                                key={action}
                                className={cx(
                                  pill,
                                  selected && 'border-foreground bg-muted font-semibold'
                                )}
                                onClick={() =>
                                  void send(
                                    selected ? 'preaction.clear' : 'preaction.set',
                                    selected
                                      ? {}
                                      : {
                                          handId: hand!.handId,
                                          street: hand!.street as 'preflop' | 'flop' | 'turn' | 'river',
                                          action
                                        }
                                  )
                                }
                              >
                                {preLabel(action)}
                              </button>
                            )
                          })}
                          <span className="text-xs text-muted-foreground">{text.room.pre.hint}</span>
                        </div>
                        {pre && (
                          <div className="flex items-center gap-2 text-[13px] text-blue">
                            {text.room.pre.selected(preLabel(pre.action))}
                            <button className={ghost} onClick={() => void send('preaction.clear', {})}>
                              {text.room.pre.cancel}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {view.phase === 'showing' && hand && self.hole && !dismissedReveal && (
                      <div className="flex flex-col gap-2 border-t border-divider pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] text-label">{text.room.reveal.title}</span>
                          {self.hole.map((slot, index) =>
                            slot.visibility === 'known' ? (
                              <button
                                key={index}
                                className={cx(
                                  'relative rounded-[8px] border-2 p-0.5',
                                  picked.includes(index) ? 'border-foreground' : 'border-transparent'
                                )}
                                onClick={() =>
                                  setPicked((value) =>
                                    value.includes(index)
                                      ? value.filter((item) => item !== index)
                                      : [...value, index]
                                  )
                                }
                                disabled={revealed.includes(index) || sendingReveal}
                              >
                                <PlayingCard card={slot.card} w={40} h={56} />
                                {revealed.includes(index) && (
                                  <span className="absolute inset-0 flex items-center justify-center rounded-[6px] bg-black/45 text-[10px] font-semibold text-white">
                                    {text.room.reveal.revealed}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <CardBack key={index} back={appearance.back} />
                            )
                          )}
                          <button
                            className={primary}
                            disabled={!picked.length || sendingReveal}
                            onClick={async () => {
                              if (!picked.length) return
                              setSendingReveal(true)
                              try {
                                const result = await send('hand.reveal', {
                                  handId: hand.handId,
                                  slots: picked as Array<0 | 1>
                                })
                                if (result) {
                                  setRevealed((value) => [...new Set([...value, ...picked])])
                                  setPicked([])
                                }
                              } finally {
                                setSendingReveal(false)
                              }
                            }}
                          >
                            {text.room.reveal.button}
                          </button>
                          <button className={pill} onClick={() => setDismissedReveal(true)}>
                            {text.room.reveal.skip}
                          </button>
                        </div>
                        <span className="text-xs text-muted-foreground">{text.room.reveal.hint}</span>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </section>

        {showPanel && (
          <>
            <div className="river-scrim md:hidden" onClick={() => setShowPanel(false)} />
            <RoomPanel
              view={view}
              self={self}
              isHost={isHost}
              host={!!host}
              locale={locale}
              text={text}
              personas={personas}
              busy={busy}
              onCommand={send}
              onAddAgent={addAgent}
              onLeave={() => void leave()}
              onClose={() => setShowPanel(false)}
            />
          </>
        )}

        {host && view.rules.coachAllowed && showCoach && (
          <aside className="river-coach-panel flex min-h-0 w-[296px] shrink-0 flex-col border-l bg-background">
            <div className="flex items-center gap-2 border-b border-[#f0f0ee] px-4 py-3">
              <span className="text-[15px] font-semibold">{text.room.coachTitle}</span>
              <div className="flex-1" />
              <button
                className="text-lg leading-none text-muted-foreground"
                onClick={() => setShowCoach(false)}
                aria-label={text.common.close}
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-4 py-3.5">
              <div className="rounded-xl bg-[oklch(0.97_0.015_255)] p-3 text-[13px] leading-[1.7]">
                <RichText text={coachText || text.room.coachHint} />
              </div>
            </div>
            <form
              className="flex gap-2 border-t p-3"
              onSubmit={(event) => {
                event.preventDefault()
                if (!question.trim()) return
                setCoachText(text.room.coachThinking)
                void host.coach(view, question).then(
                  setCoachText,
                  (error) => setCoachText(String(error))
                )
                setQuestion('')
              }}
            >
              <input
                aria-label={text.room.coachPlaceholder}
                className={field}
                maxLength={1000}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={text.room.coachPlaceholder}
              />
              <button
                type="submit"
                className="rounded-[10px] bg-foreground px-3 py-2 text-sm whitespace-nowrap text-white disabled:opacity-40"
                disabled={!question.trim()}
              >
                {text.room.ask}
              </button>
            </form>
          </aside>
        )}
      </main>
    </>
  )
}
