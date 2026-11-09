import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { Avatar } from '@river/ui'
import type {
  CommandPayload,
  CommandType,
  ParticipantView,
  RoomView
} from '@river/protocol'
import type { Locale, WebText } from './text'
import { number } from './format'
import { SwitchRow, cx, field, pill, primary } from './ui'

type Rules = CommandPayload<'room.rules'>['rules']
type Send = <T extends CommandType>(type: T, payload: CommandPayload<T>) => Promise<unknown>

const Section = ({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) => (
  <section className="flex flex-col gap-2 border-b border-divider py-3.5 last:border-0">
    <div className="flex items-center gap-2">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      <div className="flex-1" />
      {action}
    </div>
    {children}
  </section>
)

const closeMenu = (event: MouseEvent<HTMLButtonElement>) =>
  (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')

export function RoomPanel({
  view,
  self,
  isHost,
  host,
  locale,
  text,
  personas,
  busy,
  onCommand,
  onAddAgent,
  onLeave,
  onClose
}: {
  view: RoomView
  self: ParticipantView
  isHost: boolean
  host?: boolean
  locale: Locale
  text: WebText
  personas: Array<{ id: string; name: string }>
  busy: boolean
  onCommand: Send
  onAddAgent(buyIn: number, templateId: string): Promise<void>
  onLeave(): void
  onClose(): void
}) {
  const [tab, setTab] = useState<'players' | 'chips' | 'settings'>('players')
  const [amount, setAmount] = useState(view.rules.defaultBuyIn)
  const [nextRules, setNextRules] = useState<Rules>(view.rules)
  const [template, setTemplate] = useState(personas[0]?.id ?? '')
  const [confirmClose, setConfirmClose] = useState(false)
  useEffect(() => setNextRules(view.rules), [view.rulesVersion])
  useEffect(() => {
    if (!template) setTemplate(personas[0]?.id ?? '')
  }, [personas, template])

  const step = view.rules.bigBlind
  const setAmountSafe = (value: number) => setAmount(Math.max(1, Math.min(1_000_000_000, Math.round(value))))
  const status = (p: ParticipantView) =>
    !p.connected
      ? text.room.offline
      : p.sittingOut
        ? text.room.turn.sittingOut
        : p.folded
          ? text.room.turn.folded
          : ''

  return (
    <aside className="river-room-panel flex min-h-0 w-[320px] shrink-0 flex-col border-l bg-background">
      <div className="flex items-center gap-2 border-b border-[#f0f0ee] px-4 py-3">
        <span className="text-[15px] font-semibold">{text.room.panelTitle}</span>
        <div className="flex-1" />
        <button className="text-lg leading-none text-muted-foreground" onClick={onClose} aria-label={text.common.close}>
          ×
        </button>
      </div>

      <div className="border-b border-[#f0f0ee] px-4 py-2.5 min-[1280px]:hidden">
        <div className="flex gap-1 rounded-[9px] bg-muted p-[3px]">
          {(
            [
              ['players', text.room.players],
              ['chips', text.room.chips],
              ['settings', text.room.settings]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cx(
                'flex-1 rounded-[7px] px-2 py-1 text-[13px]',
                tab === key ? 'bg-white font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.08)]' : 'text-label'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto px-4 pb-5">
        <div className={cx(tab !== 'players' && 'max-[1279px]:hidden')}>
          <Section title={`${text.room.players} ${view.participants.length}`}>
            <div className="flex flex-col">
              {view.participants.map((p) => {
                const hostPlayer = p.participantId === view.hostId
                const me = p.participantId === self.participantId
                return (
                  <div key={p.participantId} className="flex items-center gap-2.5 border-b border-divider py-2 last:border-0">
                    <Avatar ini={p.ini} hue={p.hue} size={30} />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">{p.name}</span>
                        {me && <span className="rounded-[5px] bg-muted px-1.5 py-px text-[10px] text-subtle">{text.room.you}</span>}
                        {hostPlayer && <span className="rounded-[5px] bg-muted px-1.5 py-px text-[10px] text-subtle">{text.room.host}</span>}
                        {p.role === 'agent' && <span className="rounded-[5px] bg-muted px-1.5 py-px text-[10px] text-subtle">AI</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {number(p.stack, locale)}
                        {status(p) && ` · ${status(p)}`}
                      </span>
                    </div>
                    {isHost && !me && (
                      <details className="relative">
                        <summary className="list-none rounded-full px-2 py-1 text-muted-foreground hover:bg-accent">⋯</summary>
                        <div className="absolute right-0 z-20 mt-1 flex w-36 flex-col rounded-[10px] border bg-white p-1 shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
                          {p.role === 'human' && (
                            <>
                              <button
                                className="rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-accent"
                                onClick={(event) => {
                                  closeMenu(event)
                                  void onCommand('host.transfer', { targetParticipantId: p.participantId })
                                }}
                              >
                                {text.room.transfer}
                              </button>
                              <button
                                className="rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-accent"
                                onClick={(event) => {
                                  closeMenu(event)
                                  void onCommand('agent.grant', { providerParticipantId: p.participantId, maxAgents: 9 })
                                }}
                              >
                                {text.room.grant}
                              </button>
                            </>
                          )}
                          <button
                            className="rounded-md px-2.5 py-1.5 text-left text-[13px] text-lose hover:bg-accent"
                            onClick={(event) => {
                              closeMenu(event)
                              if (window.confirm(text.room.removeConfirm(p.name)))
                                void onCommand('participant.remove', { targetParticipantId: p.participantId })
                            }}
                          >
                            {text.room.remove}
                          </button>
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        </div>

        <div className={cx(tab !== 'chips' && 'max-[1279px]:hidden')}>
          <Section title={text.room.chips}>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-[-0.01em]">{number(self.stack, locale)}</span>
              <span className="text-xs text-muted-foreground">
                {text.room.stack}
                {self.pendingStack > 0 && ` · ${text.room.pending} ${number(self.pendingStack, locale)}`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center overflow-hidden rounded-[10px] border border-input bg-white">
                <button className="px-3 py-2 text-lg text-label" onClick={() => setAmountSafe(amount - step)} aria-label="−">
                  −
                </button>
                <input
                  aria-label={text.room.amount}
                  inputMode="numeric"
                  className="min-w-0 flex-1 border-0 bg-transparent px-1 py-2 text-center text-sm font-semibold outline-none"
                  value={amount}
                  onChange={(event) => {
                    const value = Number(event.target.value.replace(/[,\s]/g, ''))
                    if (Number.isFinite(value)) setAmountSafe(value)
                  }}
                />
                <button className="px-3 py-2 text-lg text-label" onClick={() => setAmountSafe(amount + step)} aria-label="+">
                  +
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={primary} onClick={() => void onCommand('funds.buyIn', { amount })}>
                {text.room.buyIn}
              </button>
              <button className={pill} onClick={() => void onCommand('funds.cashOut', { amount, source: 'stack' })}>
                {text.room.cashOut}
              </button>
              {self.pendingStack > 0 && (
                <button
                  className={pill}
                  onClick={() => void onCommand('funds.cashOut', { amount: self.pendingStack, source: 'pending' })}
                >
                  {text.room.takePending}
                </button>
              )}
            </div>
            <p className="text-xs leading-normal text-muted-foreground">{text.room.chipsHint}</p>
          </Section>

          <Section title={text.room.seatActions}>
            <div className="flex flex-wrap gap-2">
              <button className={pill} onClick={() => void onCommand('seat.sitOut', { enabled: !self.sittingOut })}>
                {self.sittingOut ? text.room.backToSeat : text.room.sitOut}
              </button>
              {self.seatId !== null && (
                <button className={pill} onClick={() => void onCommand('seat.stand', { when: 'now' })}>
                  {text.room.stand}
                </button>
              )}
              <button className={cx(pill, 'text-lose')} onClick={onLeave}>
                {text.room.leave}
              </button>
            </div>
          </Section>
        </div>

        <div className={cx(tab !== 'settings' && 'max-[1279px]:hidden')}>
          {isHost && (
            <Section title={text.room.settings} action={<span className="text-[11px] text-muted-foreground">{view.phase === 'waiting' ? text.room.nextHandNote : text.room.settingsLocked}</span>}>
              <SwitchRow
                title={text.lobby.spectator}
                desc={text.lobby.spectatorDesc}
                checked={nextRules.spectatorVision}
                onChange={(spectatorVision) => setNextRules({ ...nextRules, spectatorVision })}
              />
              <SwitchRow
                title={text.lobby.coach}
                desc={text.lobby.coachDesc}
                checked={nextRules.coachAllowed}
                onChange={(coachAllowed) => setNextRules({ ...nextRules, coachAllowed })}
              />
              <SwitchRow
                title={text.lobby.revealAll}
                desc={text.lobby.revealAllDesc}
                checked={nextRules.revealAllAfterHand}
                onChange={(revealAllAfterHand) => setNextRules({ ...nextRules, revealAllAfterHand })}
              />
              <details className="pt-1">
                <summary className="cursor-pointer text-[13px] text-label">{text.lobby.timers}</summary>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['humanTurnMs', text.lobby.turn],
                      ['disconnectGraceMs', text.lobby.grace],
                      ['showingMs', text.lobby.showing]
                    ] as const
                  ).map(([key, title]) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {title} / {text.lobby.seconds}
                      </span>
                      <input
                        className={field}
                        type="number"
                        min="1"
                        value={nextRules[key] / 1000}
                        onChange={(event) =>
                          setNextRules({ ...nextRules, [key]: Number(event.target.value) * 1000 })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
              <button
                className={cx(pill, 'self-start')}
                disabled={view.phase !== 'waiting'}
                onClick={() => void onCommand('room.rules', { rules: nextRules })}
              >
                {text.room.apply}
              </button>
            </Section>
          )}

          {host && (isHost || view.self.agentGrant) && (
            <Section title={text.room.localAi}>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={text.room.persona}
                  className={cx(field, 'min-w-0 flex-1')}
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                >
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
                <button
                  className={primary}
                  disabled={busy || !template}
                  onClick={() => void onAddAgent(amount, template)}
                >
                  {text.room.addAi}
                </button>
              </div>
            </Section>
          )}

          {isHost && (
            <Section title={text.room.danger}>
              <div className="flex flex-wrap gap-2">
                <button className={pill} onClick={() => void onCommand(view.paused ? 'room.resume' : 'room.pause', {})}>
                  {view.paused ? text.room.resume : text.room.pause}
                </button>
                {view.phase === 'showing' && view.hand && (
                  <button
                    className={pill}
                    onClick={() => void onCommand('hand.skipShowing', { handId: view.hand!.handId })}
                  >
                    {text.room.nextHand}
                  </button>
                )}
                {!confirmClose ? (
                  <button className={cx(pill, 'text-lose')} onClick={() => setConfirmClose(true)}>
                    {text.room.close}
                  </button>
                ) : (
                  <>
                    <button
                      className="rounded-full bg-lose px-5 py-2.5 text-sm font-medium whitespace-nowrap text-white hover:bg-lose/85"
                      onClick={() => void onCommand('room.close', {})}
                    >
                      {text.common.confirm}
                    </button>
                    <button className={pill} onClick={() => setConfirmClose(false)}>
                      {text.common.cancel}
                    </button>
                  </>
                )}
              </div>
              {confirmClose && (
                <p className="text-xs leading-normal text-lose">{text.room.closeConfirm}</p>
              )}
            </Section>
          )}
        </div>
      </div>
    </aside>
  )
}
