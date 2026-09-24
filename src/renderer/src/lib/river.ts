import { useEffect, useRef, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import type {
  AgentCall, Bootstrap, ChatMessage, CoachAlert, CoachEntry, Commands, Events, Lobby, ProviderInput,
  ProviderPublic, RiverApi, Settings, TableStart, TableView
} from '../../../shared/types'

declare global {
  interface Window {
    river: RiverApi
  }
}

export const river = window.river

export type Page = 'lobby' | 'table' | 'opponents' | 'replays' | 'stats' | 'settings'

export interface CoachItem extends CoachEntry {
  pending?: boolean
  error?: Events['coach:done']['error']
}

export interface RiverState {
  ready: boolean
  page: Page
  settings: Settings
  lobby: Lobby
  bankroll: number
  onboarded: boolean
  personas: Bootstrap['personas']
  providers: ProviderPublic[]
  hasTable: boolean
  view: TableView | null
  chat: ChatMessage[]
  coach: CoachItem[]
  alert: CoachAlert | null
  lastCall: AgentCall | null
  rulesOpen: boolean
  guidedAsk: boolean
}

let state: RiverState = {
  ready: false,
  page: 'lobby',
  settings: { engine: 'llm', speed: 1, coachOn: true, coachPersona: 0, level: 'novice', hard: false, autoNext: true, models: {} },
  lobby: { size: 6, blinds: 1, picks: [] },
  bankroll: 0,
  onboarded: true,
  personas: [],
  providers: [],
  hasTable: false,
  view: null,
  chat: [],
  coach: [],
  alert: null,
  lastCall: null,
  rulesOpen: false,
  guidedAsk: false
}

const subs = new Set<() => void>()
export function setState(patch: Partial<RiverState> | ((s: RiverState) => Partial<RiverState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  subs.forEach((f) => f())
}
export const getState = () => state

const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f))

// select 须返回已有引用或原始值，每次新建对象会让 React 无限重渲染
export function useRiver<T>(select: (s: RiverState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state))
}

export const useBootstrap = () => useRiver((s) => s)

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

export const go = (page: Page) => setState({ page })
export const openRules = () => setState({ rulesOpen: true })

function patchCoach(requestId: string, fn: (c: CoachItem) => CoachItem) {
  setState((s) => ({ coach: s.coach.map((c) => (c.role === 'assistant' && c.requestId === requestId ? fn(c) : c)) }))
}
const applyDone = (c: CoachItem, d: Events['coach:done']): CoachItem => ({
  ...c,
  pending: false,
  ...(!d.ok && { error: d.error, interrupted: d.error === 'interrupted' })
})

function listen() {
  river.on('table:view', (v) =>
    setState((s) => ({ view: v, hasTable: !!v, ...(!v && s.page === 'table' && { page: 'lobby' as Page }) }))
  )
  river.on('chat:append', (m) => setState((s) => (s.chat.some((x) => x.id === m.id) ? {} : { chat: [...s.chat, m] })))
  river.on('coach:alert', (alert) => setState({ alert }))
  river.on('bankroll', (bankroll) => setState({ bankroll }))
  river.on('agent:last', (lastCall) => setState({ lastCall }))
  river.on('coach:delta', ({ requestId, text }) => patchCoach(requestId, (c) => ({ ...c, text: c.text + text })))
  river.on('coach:done', (d) => patchCoach(d.requestId, (c) => applyDone(c, d)))
}

export async function init() {
  listen()
  const b = await invoke('app.bootstrap')
  setState({
    ready: true,
    settings: b.settings,
    lobby: b.lobby,
    bankroll: b.bankroll,
    onboarded: b.onboarded,
    personas: b.personas,
    providers: b.providers,
    hasTable: b.hasTable,
    lastCall: b.lastCall,
    chat: b.chat,
    // 重载时的在途回答没有 pending 标记可恢复，后续 delta/done 仍会按 requestId 接上
    coach: b.coachThread,
    rulesOpen: !b.onboarded
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
export const reloadSettings = () => updateSettings({})

export async function updateLobby(patch: Partial<Lobby>) {
  setState((s) => ({ lobby: { ...s.lobby, ...patch } }))
  try {
    setState({ lobby: await invoke('lobby.update', patch) })
  } catch (e) {
    fail(e)
  }
}

export async function startTable(opts: TableStart) {
  // table.start 之后事件只追加，旧桌的公屏与教练对话要在入座前清掉
  setState({ chat: [], coach: [], alert: null })
  try {
    await invoke('table.start', opts)
  } catch (e) {
    return fail(e)
  }
  setState({ page: 'table' })
  // 教学牌局会改写 coachOn、level 但不推送
  if (opts.guided) await reloadSettings()
}

export const coachConfigured = (s: RiverState) => {
  const m = s.settings.models.coach
  const p = m && s.providers.find((x) => x.id === m.providerId)
  return !!p && !p.needsKey
}

export function startGuided() {
  if (coachConfigured(state)) return startTable({ ...GUIDED, guided: true })
  setState({ guidedAsk: true })
}
export const GUIDED: Omit<TableStart, 'guided'> = { size: 3, blinds: 0, picks: ['bai', 'zen'] }

// 先落 pending 条目再发命令：之后的 delta/done 一定能按 requestId 找到它
export async function askCoach(text: string) {
  const requestId = crypto.randomUUID()
  setState((s) => ({ coach: [...s.coach, { role: 'user', text, requestId }, { role: 'assistant', text: '', requestId, pending: true }] }))
  try {
    await invoke('coach.ask', requestId, text)
  } catch (e) {
    patchCoach(requestId, (c) => applyDone(c, { requestId, ok: false, error: 'failed' }))
    throw e
  }
}

export async function finishOnboarding() {
  setState({ rulesOpen: false })
  if (state.onboarded) return
  setState({ onboarded: true })
  await invoke('onboarding.done').catch(fail)
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
    await invoke('provider.delete', id)
  } catch (e) {
    return fail(e)
  }
  setState((s) => ({ providers: s.providers.filter((x) => x.id !== id) }))
  // 主进程会同时清空引用它的角色模型
  await reloadSettings()
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

export async function setPersonaPrompt(id: string, prompt: string) {
  const p = state.personas.find((x) => x.id === id)
  if (!p) return
  const text = prompt.trim()
  const reset = !text || text === p.prompt
  if (reset ? p.promptOverride === undefined : text === p.promptOverride) return
  try {
    await (reset ? invoke('persona.resetPrompt', id) : invoke('persona.setPrompt', id, text))
  } catch (e) {
    return fail(e)
  }
  setState((s) => ({
    personas: s.personas.map((x) => (x.id !== id ? x : reset ? { ...x, promptOverride: undefined } : { ...x, promptOverride: text }))
  }))
}

export { fail as toastError }
