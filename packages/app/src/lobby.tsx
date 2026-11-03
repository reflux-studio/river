import { useState } from 'react'
import { LobbyLayout, LobbyRow, Segmented } from '@river/ui'
import type { CommandPayload, PublicProfile } from '@river/protocol'
import type { Locale, WebText } from './text'
import { Panel, PanelTitle, SwitchRow, cx, field, ghost, primary } from './ui'

type Rules = CommandPayload<'room.rules'>['rules']

const PRESETS: { rules: Pick<Rules, 'capacity' | 'smallBlind' | 'bigBlind'> }[] = [
  { rules: { capacity: 3, smallBlind: 5, bigBlind: 10 } },
  { rules: { capacity: 6, smallBlind: 10, bigBlind: 20 } },
  { rules: { capacity: 10, smallBlind: 25, bigBlind: 50 } }
]

const DEFAULT_RULES: Rules = {
  capacity: 6,
  smallBlind: 10,
  bigBlind: 20,
  defaultBuyIn: 2000,
  humanTurnMs: 30_000,
  disconnectGraceMs: 60_000,
  showingMs: 10_000,
  coachAllowed: false,
  revealAllAfterHand: false,
  spectatorVision: true
}

export function Lobby({
  connected,
  busy,
  hasHost,
  locale,
  text,
  profile,
  onProfile,
  serverUrl,
  onServerUrl,
  onCreate,
  onJoin,
  onHistory,
  onSettings
}: {
  connected: boolean
  busy: boolean
  hasHost: boolean
  locale: Locale
  text: WebText
  profile: PublicProfile
  onProfile(profile: PublicProfile): void
  serverUrl: string
  onServerUrl(url: string): void
  onCreate(rules: Rules): void
  onJoin(room: string): void
  onHistory(): void
  onSettings?: () => void
}) {
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES)
  const [room, setRoom] = useState(() => location.pathname.split('/join/')[1]?.split('/')[0] ?? '')
  const [address, setAddress] = useState(serverUrl === 'local' ? '' : serverUrl)
  const [showConnection, setShowConnection] = useState(false)
  const named = profile.name.trim().length > 0

  const setPreset = (preset: (typeof PRESETS)[number]) =>
    setRules({ ...rules, ...preset.rules, defaultBuyIn: preset.rules.bigBlind * 100 })
  const presetOn = (preset: (typeof PRESETS)[number]) =>
    rules.capacity === preset.rules.capacity &&
    rules.smallBlind === preset.rules.smallBlind &&
    rules.bigBlind === preset.rules.bigBlind
  const join = () => {
    if (!room.trim()) return
    onJoin(room.trim())
  }
  const create = () => {
    if (!named) return
    onCreate(rules)
  }

  const JoinPanel = (
    <Panel>
      <PanelTitle>{text.lobby.joinTitle}</PanelTitle>
      <p className="text-[13px] leading-[1.6] text-muted-foreground">{text.lobby.joinDesc}</p>
      <input
        aria-label={text.lobby.joinTitle}
        className={field}
        value={room}
        onChange={(event) => setRoom(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) join()
        }}
        placeholder={text.lobby.joinPh}
      />
      {!named && (
        <input
          aria-label={text.lobby.name}
          className={field}
          maxLength={80}
          value={profile.name}
          onChange={(event) =>
            onProfile({ ...profile, name: event.target.value, ini: event.target.value.slice(0, 1) || '我' })
          }
          placeholder={text.lobby.namePh}
        />
      )}
      <button className={primary} disabled={!connected || !room.trim() || !named || busy} onClick={join}>
        {busy ? text.common.loading : text.lobby.join}
      </button>
    </Panel>
  )

  return (
    <LobbyLayout
      aside={
        <>
          <div className="hidden md:block">{JoinPanel}</div>
          <Panel>
            <PanelTitle>{text.lobby.historyTitle}</PanelTitle>
            <p className="text-[13px] leading-[1.6] text-muted-foreground">{text.lobby.historyDesc}</p>
            <button className={cx(ghost, 'self-start px-0')} onClick={onHistory}>
              {text.lobby.viewHistory} →
            </button>
          </Panel>
          <div className="flex flex-col gap-2">
            {onSettings && (
              <button className={cx(ghost, 'self-start px-0')} onClick={onSettings}>
                {locale === 'zh' ? '模型与设置' : 'Models & settings'} →
              </button>
            )}
            <button
              className={cx(ghost, 'self-start px-0')}
              onClick={() => setShowConnection((value) => !value)}
            >
              {text.lobby.connection} · {serverUrl === 'local' ? text.room.local : serverUrl}
            </button>
            {showConnection && (
              <div className="flex flex-col gap-3 rounded-[14px] border bg-white px-4 py-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">{text.lobby.server}</span>
                  <input
                    aria-label={text.lobby.server}
                    className={field}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    placeholder="ws://…/ws"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={primary}
                    disabled={!address.trim()}
                    onClick={() => onServerUrl(address.trim())}
                  >
                    {text.lobby.connect}
                  </button>
                  {hasHost && (
                    <button
                      className={cx(ghost, 'border border-input')}
                      onClick={() => onServerUrl('local')}
                    >
                      {text.lobby.local}
                    </button>
                  )}
                </div>
                <span className="text-xs leading-normal text-muted-foreground">{text.lobby.connectionHint}</span>
              </div>
            )}
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-semibold tracking-[-0.01em]">{text.lobby.title}</h1>
        <p className="text-[15px] text-subtle">{text.lobby.intro}</p>
      </div>

      <div className="md:hidden">{JoinPanel}</div>

      <div className="grid grid-cols-3 gap-3">
        {PRESETS.map((preset, index) => (
          <button
            key={preset.rules.capacity}
            onClick={() => setPreset(preset)}
            className={cx(
              'flex flex-col gap-1.5 rounded-[14px] bg-white p-4 text-left',
              presetOn(preset) ? 'border-[1.5px] border-foreground' : 'border'
            )}
          >
            <span className="text-base font-semibold">{text.lobby.presets[index].title}</span>
            <span className="text-[13px] leading-normal text-muted-foreground">
              {text.lobby.presets[index].desc}
            </span>
          </button>
        ))}
      </div>

      <Panel>
        <LobbyRow label={text.lobby.name}>
          <input
            className={field}
            maxLength={80}
            value={profile.name}
            onChange={(event) =>
              onProfile({ ...profile, name: event.target.value, ini: event.target.value.slice(0, 1) || '我' })
            }
            placeholder={text.lobby.namePh}
          />
        </LobbyRow>
        <LobbyRow label={text.lobby.capacity}>
          <div className="overflow-x-auto">
            <Segmented
              value={rules.capacity}
              options={Array.from({ length: 9 }, (_, index) => ({
                label: String(index + 2),
                value: (index + 2) as Rules['capacity']
              }))}
              onChange={(capacity) => setRules({ ...rules, capacity })}
            />
          </div>
        </LobbyRow>
        <LobbyRow label={text.lobby.blinds}>
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
        <LobbyRow label={text.lobby.buyIn}>
          <input
            aria-label={text.lobby.buyIn}
            className={field}
            type="number"
            min="1"
            max="1000000000"
            value={rules.defaultBuyIn}
            onChange={(event) => setRules({ ...rules, defaultBuyIn: Number(event.target.value) })}
          />
        </LobbyRow>

        <div className="border-t border-divider pt-3">
          <div className="flex items-center gap-2 pb-1">
            <span className="text-[13px] font-medium">{text.lobby.rules}</span>
          </div>
          <SwitchRow
            title={text.lobby.spectator}
            desc={text.lobby.spectatorDesc}
            checked={rules.spectatorVision}
            onChange={(spectatorVision) => setRules({ ...rules, spectatorVision })}
          />
          <SwitchRow
            title={text.lobby.coach}
            desc={text.lobby.coachDesc}
            checked={rules.coachAllowed}
            onChange={(coachAllowed) => setRules({ ...rules, coachAllowed })}
          />
          <SwitchRow
            title={text.lobby.revealAll}
            desc={text.lobby.revealAllDesc}
            checked={rules.revealAllAfterHand}
            onChange={(revealAllAfterHand) => setRules({ ...rules, revealAllAfterHand })}
          />
        </div>

        <details className="border-t border-divider pt-3">
          <summary className="cursor-pointer text-[13px] text-label">{text.lobby.timers}</summary>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {(
              [
                ['humanTurnMs', text.lobby.turn],
                ['disconnectGraceMs', text.lobby.grace],
                ['showingMs', text.lobby.showing]
              ] as const
            ).map(([key, title]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  {title} / {text.lobby.seconds}
                </span>
                <input
                  className={field}
                  type="number"
                  min="1"
                  value={rules[key] / 1000}
                  onChange={(event) => setRules({ ...rules, [key]: Number(event.target.value) * 1000 })}
                />
              </label>
            ))}
          </div>
        </details>

        <div className="flex items-center gap-3 border-t border-divider pt-4">
          <span className="min-w-0 flex-1 text-xs leading-normal text-muted-foreground">
            {named ? text.lobby.createHint : text.lobby.errorName}
          </span>
          <button className={primary} disabled={!connected || !named || busy} onClick={create}>
            {busy ? text.lobby.creating : text.lobby.create}
          </button>
        </div>
      </Panel>
    </LobbyLayout>
  )
}
