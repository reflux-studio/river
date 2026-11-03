import { useEffect, useState, useSyncExternalStore } from 'react'
import { RiverClient, webSocketTransport, type KeyValueStore } from '@river/client'
import type { Effect, PublicProfile } from '@river/protocol'
import type { AppearanceValue } from '@river/ui'
import { createTableAudio } from './audio'
import { History } from './history'
import { Lobby } from './lobby'
import { Room } from './room'
import { webText, type Locale } from './text'
import { cx } from './ui'
import type { DesktopHost } from './host'
export { browserStore } from './browser-store'
export type { DesktopHost } from './host'

const emptyState = { view: null, connected: false, error: null, effects: [] as Effect[] }
const emptySnapshot = () => emptyState
const noopSubscribe = () => () => {}
const defaultAppearance: AppearanceValue = {
  felt: 'green',
  feltCustom: '#39775c',
  back: 'red',
  fx: 'full'
}

const defaultProfile = (): PublicProfile => ({
  profileId: crypto.randomUUID(),
  name: '',
  ini: '我',
  hue: 158,
  locale: (navigator.language.startsWith('zh') ? 'zh' : 'en') as Locale
})

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
  tableAppearance?: AppearanceValue
  onAppearance?: (value: AppearanceValue) => void
}) {
  const [url, setUrl] = useState(defaultServer)
  const [client, setClient] = useState<RiverClient | null>(null)
  const [profile, setProfile] = useState<PublicProfile>(defaultProfile)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState('')
  const [sound, setSound] = useState(true)
  const [tab, setTab] = useState<'play' | 'history'>('play')
  const [busy, setBusy] = useState(false)
  const [localAppearance, setLocalAppearance] = useState<AppearanceValue>(defaultAppearance)
  const [audio] = useState(() => createTableAudio())
  const text = webText(profile.locale)
  const appearance = tableAppearance ?? localAppearance

  useEffect(() => {
    void store.get<PublicProfile>('profile').then((saved) => {
      if (saved) setProfile({ ...defaultProfile(), ...saved })
    })
    void store.get<boolean>('sound').then((saved) => {
      if (saved !== undefined) setSound(saved)
    })
  }, [store])

  useEffect(() => {
    if (tableAppearance) return
    void store.get<AppearanceValue>('appearance').then((saved) => {
      if (saved) setLocalAppearance(saved)
    })
  }, [store, tableAppearance])

  useEffect(() => {
    const next = new RiverClient(
      url === 'local' && host ? host.localTransport() : webSocketTransport(url),
      store,
      url
    )
    setClient(next)
    void next.connect().catch((cause) => setError(String(cause)))
    return () => next.close()
  }, [url, store, host])

  const state = useSyncExternalStore(
    client?.subscribe ?? noopSubscribe,
    client?.getSnapshot ?? emptySnapshot
  )

  useEffect(() => {
    document.documentElement.lang = profile.locale
  }, [profile.locale])

  useEffect(() => {
    audio.setEnabled(sound)
  }, [audio, sound])

  useEffect(() => () => audio.stop(), [audio])

  const message = error || state.error
  const changeAppearance = (value: AppearanceValue) => {
    if (onAppearance) onAppearance(value)
    else {
      setLocalAppearance(value)
      void store.set('appearance', value)
    }
  }
  const toggleSound = (value: boolean) => {
    setSound(value)
    void store.set('sound', value)
    if (value) void audio.prepare()
  }
  const toggleLanguage = () => {
    const next = { ...profile, locale: (profile.locale === 'zh' ? 'en' : 'zh') as Locale }
    setProfile(next)
    void store.set('profile', next)
  }

  const enter = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await store.set('profile', profile)
      await audio.prepare()
      await action()
    } catch (cause) {
      setError(String(cause))
    } finally {
      setBusy(false)
    }
  }
  const create = (rules: Parameters<Parameters<typeof Lobby>[0]['onCreate']>[0]) =>
    void enter(async () => {
      if (!client) return
      await client.create(profile, rules)
      await client.command('funds.buyIn', { amount: rules.defaultBuyIn })
    })
  const join = (room: string) =>
    void enter(async () => {
      if (!client) return
      const roomId = room.trim().split('/join/').at(-1)!.split(/[/?#]/)[0].trim()
      await client.join(roomId, profile)
      // join 在 bound 时返回，首个投影可能还没到；等视图再按房间的起手买入
      await client.whenBound()
      const view = client.getSnapshot().view
      if (view) await client.command('funds.buyIn', { amount: view.rules.defaultBuyIn })
    })
  const back = async () => {
    setTab('play')
    try {
      await client?.forgetRoom()
    } catch (cause) {
      setError(String(cause))
    }
  }

  return (
    <div className="river-game flex h-[100dvh] min-w-0 flex-col bg-background" data-desktop={!!host}>
      <header className="river-header flex h-[52px] shrink-0 items-center gap-3 border-b bg-topbar px-4">
        <button
          className="flex shrink-0 items-center gap-1.5 text-base font-semibold"
          onClick={() => setTab('play')}
        >
          <img
            src={new URL('./assets/river-icon.png', import.meta.url).href}
            alt=""
            width={28}
            height={28}
          />
          River
        </button>
        <nav className="ml-1 flex min-w-0 gap-0.5 overflow-x-auto">
          {(
            [
              ['play', text.nav.lobby],
              ['history', text.nav.history]
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cx(
                'rounded-lg px-3 py-1.5 text-sm whitespace-nowrap',
                tab === key ? 'bg-[#e9e9e6] font-semibold text-foreground' : 'text-label hover:bg-[#efefec]'
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        {onSettings && (
          <button
            onClick={onSettings}
            className="rounded-full px-2.5 py-1 text-[13px] text-label hover:bg-accent"
          >
            {text.nav.settings}
          </button>
        )}
        <button
          onClick={toggleLanguage}
          className="rounded-full px-2.5 py-1 text-[13px] text-label hover:bg-accent"
          aria-label="Language"
        >
          {text.language}
        </button>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cx('size-1.5 rounded-full', state.connected ? 'bg-win' : 'bg-lose')} />
          <span className="hidden sm:inline">
            {state.connected ? text.status.online : text.status.reconnecting}
          </span>
        </span>
      </header>

      {message && message !== dismissed && (
        <div className="flex items-start justify-between gap-3 bg-[#fff3ee] px-4 py-2.5 text-[13px] text-lose" role="alert">
          <span className="min-w-0 break-words">{message}</span>
          <button
            className="shrink-0 text-base leading-none"
            onClick={() => {
              setError('')
              setDismissed(message)
            }}
            aria-label={text.common.close}
          >
            ×
          </button>
        </div>
      )}

      {tab === 'history' ? (
        <History store={store} locale={profile.locale} text={text} onBack={() => setTab('play')} />
      ) : state.view && client ? (
        <Room
          client={client}
          view={state.view}
          effects={state.effects}
          connected={state.connected}
          host={host}
          locale={profile.locale}
          text={text}
          appearance={appearance}
          onAppearance={changeAppearance}
          sound={sound}
          onSound={toggleSound}
          audio={audio}
          onError={setError}
          onBack={() => void back()}
        />
      ) : (
        <Lobby
          connected={state.connected}
          busy={busy}
          hasHost={!!host}
          locale={profile.locale}
          text={text}
          profile={profile}
          onProfile={setProfile}
          serverUrl={url}
          onServerUrl={(value) => {
            setUrl(value)
            setTab('play')
          }}
          onCreate={create}
          onJoin={join}
          onHistory={() => setTab('history')}
          onSettings={onSettings}
        />
      )}
    </div>
  )
}
