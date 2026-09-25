import type { Card, HandCat, Street } from '@river/engine'
import type { Locale, PersonaSeed } from '@river/i18n'
import type { Back, Felt, Fx, SeatView } from '@river/ui/types'
import type { Currency } from './currency'

export type { Card, HandCat, Street, Back, Felt, Fx }
export type { SeatView as SeatViewPublic }
// 教练局：教练每步先说、一手结束亮全部底牌并复盘；自由局只有概率面板
export type Mode = 'coach' | 'free'

export interface ModelRef {
  providerId: string
  modelId: string
}

export interface Settings {
  speed: 0 | 1 | 2
  coachPersona: 0 | 1 | 2
  level: 'novice' | 'pro'
  hard: boolean
  felt: Felt
  feltCustom: string
  back: Back
  fx: Fx
  // 花费显示的货币；价格源（models.dev）是美元，按汇率换算
  currency: Currency
  // 手动汇率（1 美元 = fxRate 当前货币）；null 为自动
  fxRate: number | null
  models: { opponent?: ModelRef; coach?: ModelRef }
  // 只在引导页选一次（onboarding.done），之后不能改
  locale: Locale
}

export interface Lobby {
  size: 2 | 3 | 4 | 5 | 6
  blinds: 0 | 1 | 2
  picks: string[]
  mode: Mode
}

export interface ChatMessage {
  id: string
  kind: 'sys' | 'act' | 'msg'
  from?: string
  text?: string
  act?: string
  // 系统消息附带的公共牌（翻牌、转牌、河牌）
  cards?: Card[]
  // 只在 kind === 'sys' 时有值：Agent 按它挑出分手与重新买入，不依赖文字语言
  sysKind?: 'hand' | 'rebuy' | 'street' | 'seat' | 'win'
  at: number
}

export interface Persona extends PersonaSeed {
  builtin: boolean
  // 内置角色被改过（可“恢复默认”）
  edited: boolean
  // 被删除的内置角色（可恢复）；自建角色删除即消失
  deleted: boolean
}

export type PersonaInput = Pick<Persona, 'name' | 'tag' | 'ini' | 'hue' | 'desc' | 'prompt'> & { id?: string }

export interface HandPlayer {
  id: string
  personaId?: string
  name: string
  // 本手位置（按钮、小盲、枪口…）；旧记录没有
  pos?: string
  // 摊牌亮出的牌（玩家本人恒有）；对手读公开结果只看这一项
  hole: Card[] | null
  // 教练局一手结束时亮出的全部底牌，只给玩家界面、回放与教练
  holeAfter?: Card[]
  folded: boolean
  handName: string
  won: number
  net: number
}

export interface HandLogEntry {
  street: Street
  board: boolean
  name: string
  label: string
  cards?: Card[]
  // 结构化字段（v2 起）：旧记录只有文案
  seat?: number
  type?: 'blind' | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'return'
  amount?: number
  to?: number
  allIn?: boolean
}

export interface HandRecord {
  hand: number
  sb: number
  bb: number
  // 旧记录没有，视为自由局
  mode?: Mode
  net: number
  pot: number
  showdown: boolean
  hero: Card[]
  board: Card[]
  players: HandPlayer[]
  log: HandLogEntry[]
  vpip: boolean
  pfr: boolean
}

export interface HandSummary {
  id: number
  handNo: number
  playedAt: number
  hero: Card[]
  net: number
  showdown: boolean
  vpip: boolean
  pfr: boolean
}

export interface Recap {
  headline: string
  good: string
  improve: string
  tip: string
}

export interface ProviderInput {
  id?: string
  name: string
  kind: string
  baseUrl?: string
  apiKey?: string
}

export interface ProviderPublic {
  id: string
  name: string
  kind: string
  baseUrl?: string
  keyTail: string | null
  needsKey: boolean
  supportsRequired: boolean | null
}

export interface Legal {
  toCall: number
  canCheck: boolean
  minTo: number
  maxTo: number
  canRaise: boolean
  bet: number
  stack: number
}

export type HeroAction = { type: 'fold' | 'call' } | { type: 'raise'; to: number }

export interface CoachState {
  busy: 'speak' | 'ask' | 'recap' | null
  // 轮到玩家但教练还没说完：操作区锁定
  locked: boolean
  // 一手结束后可以发下一手（复盘结束、失败或跳过）
  canNext: boolean
  // 可以重试的教练条目（失败的复盘，或当前决策点失败的讲解）
  retry: string | null
}

export interface TableView {
  mode: Mode
  title: string
  bb: number
  handNo: number
  street: Street | 'idle'
  board: Card[]
  pot: number
  seats: SeatView[]
  hero: { legal: Legal; toCall: number; isTurn: boolean; defaultRaiseTo: number; presets: { label: string; to: number }[] }
  done: boolean
  runout: boolean
  result: { text: string; sub: string; heroWon: boolean; net: number } | null
  heroBust: boolean
  nums: { eq: number; need: number; outs: number | null; handCat: HandCat; stale: boolean } | null
  // 对手模型调用失败，牌局停下
  stalled: { name: string; error: string; settings: boolean } | null
  coach: CoachState | null
  guided: boolean
  cost: Cost
}

export interface Cost {
  usd: number
  tokens: number
  // 没有价格的 token 数（未计入 usd）
  unpriced: number
}

export interface CoachEntry {
  id: string
  kind: 'user' | 'answer' | 'speak' | 'recap'
  text: string
  handNo: number
  recap?: Recap
  // 复盘卡头部：这一手的输赢、玩家底牌与公共牌
  hand?: { net: number; hero: Card[]; board: Card[] }
  status: 'pending' | 'done' | 'failed' | 'skipped'
  error?: string
}

export type Purpose = 'decide' | 'speak' | 'ask' | 'recap' | 'talk'

export interface UsageSummary {
  since: number
  purposes: { purpose: Purpose; calls: number; tokens: number; unknown: number; usd: number; unpriced: number }[]
  // 最近 40 手（按牌桌与手号）的花费
  hands: { handNo: number; usd: number; tokens: number }[]
  total: Cost & { calls: number; input: number; output: number; unknown: number }
  avgPerHand: number | null
}

export interface Bootstrap {
  settings: Settings
  lobby: Lobby
  bankroll: number
  onboarded: boolean
  personas: Persona[]
  providers: ProviderPublic[]
  view: TableView | null
  coachThread: CoachEntry[]
  chat: ChatMessage[]
  version: string
  update: string | null
  fx: FxRates | null
  packaged: boolean
}

// 以美元为基准的汇率（只保留可选币种）
export interface FxRates {
  date: string
  rates: Partial<Record<Currency, number>>
}

export interface TableStart {
  size: Lobby['size']
  blinds: Lobby['blinds']
  picks: string[]
  mode: Mode
  guided: boolean
}

export type UpdateCheck =
  | { state: 'latest' }
  | { state: 'downloading'; version: string }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export interface Commands {
  'app.bootstrap': () => Bootstrap
  'settings.update': (patch: Partial<Settings>) => Settings
  'lobby.update': (patch: Partial<Lobby>) => Lobby
  'persona.save': (input: PersonaInput) => Persona
  'persona.delete': (id: string) => void
  'persona.restore': (id: string) => void
  'persona.reset': (id: string) => void
  'provider.save': (input: ProviderInput) => ProviderPublic
  'provider.delete': (id: string) => Settings
  'provider.test': (input: { providerId: string; modelId: string }) => { ok: boolean; supportsRequired?: boolean; error?: string }
  'provider.registry': () => { kind: string; name: string; models: string[] }[]
  'table.start': (opts: TableStart) => void
  'table.heroAct': (a: HeroAction) => void
  'table.nextHand': () => void
  'table.rebuy': () => void
  'table.leave': () => void
  'table.retry': () => void
  'coach.ask': (text: string) => void
  'coach.skip': () => void
  'coach.retry': () => void
  'hands.list': () => HandSummary[]
  'hands.get': (id: number) => { record: HandRecord; review?: Recap | string; cost?: Cost } | null
  'hands.review': (id: number) => void
  'usage.summary': () => UsageSummary
  'usage.reset': () => void
  'data.clearHistory': () => void
  'data.resetMemory': () => void
  'onboarding.done': (locale: Locale) => { settings: Settings; personas: Persona[] }
  'update.install': () => void
  'update.check': () => UpdateCheck
}

export interface Events {
  // null：已离桌
  'table:view': TableView | null
  'chat:append': ChatMessage
  // 整条教练消息；流式输出时同一 id 反复推送
  'coach:upsert': CoachEntry
  'review:done': { handId: number; review?: Recap; error?: string }
  bankroll: number
  personas: Persona[]
  'hands:changed': void
  'usage:changed': void
  'update:ready': { version: string }
  // 手动检查发现新版本后，这次下载失败
  'update:error': { message: string }
  fx: FxRates
}

// bootstrap 的 chat 快照与之后的 chat:append 可能重叠，Renderer 按消息 id 去重
export interface RiverApi {
  invoke<K extends keyof Commands>(cmd: K, ...args: Parameters<Commands[K]>): Promise<Awaited<ReturnType<Commands[K]>>>
  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): () => void
}
