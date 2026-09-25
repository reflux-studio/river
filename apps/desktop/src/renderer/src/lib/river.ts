import { useEffect, useRef, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { dict, type Locale } from '@river/i18n'
import type {
  Bootstrap, ChatMessage, CoachEntry, Commands, Events, FxRates, Lobby, Persona, PersonaInput, ProviderInput,
  ProviderPublic, RiverApi, Settings, TableStart, TableView
} from '../../../shared/types'

declare global {
  interface Window {
    river: RiverApi
  }
}

export const river = window.river

export type Page = 'lobby' | 'table' | 'opponents' | 'replays' | 'stats' | 'settings'

export interface RiverState {
  ready: boolean
  page: Page
  settings: Settings
  lobby: Lobby
  bankroll: number
  onboarded: boolean
  personas: Persona[]
  providers: ProviderPublic[]
  view: TableView | null
  chat: ChatMessage[]
  coach: CoachEntry[]
  rulesOpen: boolean
  // 入座被拦下（没配模型）时的提示
  needModel: 'opponent' | 'coach' | null
  version: string
  update: string | null
  fx: FxRates | null
}

let state: RiverState = {
  ready: false,
  page: 'lobby',
  settings: { speed: 1, coachPersona: 0, level: 'novice', hard: false, felt: 'green', feltCustom: '#2f6b55', back: 'red', fx: 'full', currency: 'cny', fxRate: null, models: {}, locale: 'zh' },
  lobby: { size: 6, blinds: 1, picks: [], mode: 'coach' },
  bankroll: 0,
  onboarded: true,
  personas: [],
  providers: [],
  view: null,
  chat: [],
  coach: [],
  rulesOpen: false,
  needModel: null,
  version: '',
  update: null,
  fx: null
}

const subs = new Set<() => void>()
export function setState(patch: Partial<RiverState> | ((s: RiverState) => Partial<RiverState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f))

// select 须返回已有引用或原始值，每次新建对象会让 React 无限重渲染
export function useRiver<T>(select: (s: RiverState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

// 用于页面自己关心、且不必进全局状态的事件（如 review:done、hands:changed）
export function useEvent<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => river.on(event, (p) => ref.current(p)), [event])
}

export async function invoke<K extends keyof Commands>(cmd: K, ...args: Parameters<Commands[K]>) {
  try {
    return await river.invoke(cmd, ...args)
  } catch (e) {
    // Electron 把主进程异常包装成 "Error invoking remote method 'x': Error: 原因"，界面只要原因
    const msg = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e)
    throw new Error(msg)
  }
}

// 语言在运行期间不变（只在引导页选一次），所以直接跟随 settings.locale
export const useT = () => dict(useRiver((s) => s.settings.locale))

export const go = (page: Page) => setState({ page })
export const openRules = () => setState({ rulesOpen: true })

// 与主进程公屏上限一致
const MAX_CHAT = 300

function listen() {
  river.on('table:view', (v) => setState((s) => ({ view: v, ...(!v && s.page === 'table' && { page: 'lobby' as Page }) })))
  river.on('chat:append', (m) => setState((s) => (s.chat.some((x) => x.id === m.id) ? {} : { chat: [...s.chat, m].slice(-MAX_CHAT) })))
  river.on('coach:upsert', (e) =>
    setState((s) => ({ coach: s.coach.some((x) => x.id === e.id) ? s.coach.map((x) => (x.id === e.id ? e : x)) : [...s.coach, e] }))
  )
  river.on('bankroll', (bankroll) => setState({ bankroll }))
  river.on('personas', (personas) => setState({ personas }))
  river.on('update:ready', ({ version }) => setState({ update: version }))
  river.on('fx', (fx) => setState({ fx }))
}

export async function init() {
  listen()
  const b: Bootstrap = await invoke('app.bootstrap')
  setState({
    ready: true,
    settings: b.settings,
    lobby: b.lobby,
    bankroll: b.bankroll,
    onboarded: b.onboarded,
    personas: b.personas,
    providers: b.providers,
    view: b.view,
    chat: b.chat,
    coach: b.coachThread,
    rulesOpen: !b.onboarded,
    version: b.version,
    update: b.update,
    fx: b.fx
  })
}

const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : String(e))

// 主进程先改缓存后写库，写库失败时修改仍可能生效，所以乐观更新后不回滚
export async function updateSettings(patch: Partial<Settings>) {
  setState((s) => ({ settings: { ...s.settings, ...patch, models: { ...s.settings.models, ...patch.models } } }))
  try {
    setState({ settings: await invoke('settings.update', patch) })
  } catch (e) {
    fail(e)
  }
}

export async function updateLobby(patch: Partial<Lobby>) {
  setState((s) => ({ lobby: { ...s.lobby, ...patch } }))
  try {
    setState({ lobby: await invoke('lobby.update', patch) })
  } catch (e) {
    fail(e)
  }
}

type Role = keyof Settings['models']

export function modelOf(s: RiverState, role: Role) {
  const m = s.settings.models[role]
  const provider = m && s.providers.find((x) => x.id === m.providerId)
  return provider && { provider, modelId: m.modelId }
}
export const configured = (s: RiverState, role: Role) => modelOf(s, role)?.provider.needsKey === false

// 所有入座入口都先检查模型：缺哪个就提示并引导去设置（discussion §9）
export async function startTable(opts: TableStart) {
  const coach = opts.guided || opts.mode === 'coach'
  if (!configured(state, 'opponent')) return setState({ needModel: 'opponent', rulesOpen: false })
  if (coach && !configured(state, 'coach')) return setState({ needModel: 'coach', rulesOpen: false })
  // table.start 之后事件只追加，旧桌的公屏与教练对话要在入座前清掉
  setState({ chat: [], coach: [] })
  try {
    await invoke('table.start', opts)
    setState({ page: 'table', rulesOpen: false })
  } catch (e) {
    fail(e)
  }
}

// 教学牌局的桌型由主进程固定，这里传大厅配置只为满足参数类型
export const startGuided = () => startTable({ ...state.lobby, mode: 'coach', guided: true })

export const askCoach = (text: string) => invoke('coach.ask', text).catch(fail)

// 所有结束引导的路径都走这里；主进程按所选语言重建对手预设，返回后才能开桌
export async function finishOnboarding(locale: Locale) {
  setState({ rulesOpen: false })
  if (state.onboarded) return
  setState({ onboarded: true })
  try {
    const { settings, personas } = await invoke('onboarding.done', locale)
    setState({ settings, personas })
  } catch (e) {
    fail(e)
  }
}

export async function saveProvider(input: ProviderInput) {
  const p = await invoke('provider.save', input)
  setState((s) => ({
    providers: s.providers.some((x) => x.id === p.id) ? s.providers.map((x) => (x.id === p.id ? p : x)) : [...s.providers, p]
  }))
  return p
}

export async function deleteProvider(id: string) {
  try {
    const settings = await invoke('provider.delete', id)
    setState((s) => ({ settings, providers: s.providers.filter((x) => x.id !== id) }))
  } catch (e) {
    fail(e)
  }
}

export async function testProvider(providerId: string, modelId: string) {
  const r = await invoke('provider.test', { providerId, modelId })
  if (r.ok) {
    setState((s) => ({
      providers: s.providers.map((x) => (x.id === providerId ? { ...x, supportsRequired: r.supportsRequired ?? null } : x))
    }))
  }
  return r
}

let registry: Promise<Awaited<ReturnType<Commands['provider.registry']>>> | undefined
export const getRegistry = () => (registry ??= invoke('provider.registry'))

export const savePersona = (input: PersonaInput) => invoke('persona.save', input).catch((e) => (fail(e), null))
export const deletePersona = (id: string) => invoke('persona.delete', id).catch(fail)
export const restorePersona = (id: string) => invoke('persona.restore', id).catch(fail)
export const resetPersona = (id: string) => invoke('persona.reset', id).catch(fail)

export { fail as toastError }
