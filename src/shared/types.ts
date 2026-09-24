export type Card = string
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'

export interface ModelRef {
  providerId: string
  modelId: string
}

export interface Settings {
  engine: 'llm' | 'local'
  speed: 0 | 1 | 2
  coachOn: boolean
  coachPersona: 0 | 1 | 2
  level: 'novice' | 'pro'
  hard: boolean
  autoNext: boolean
  models: { opponent?: ModelRef; coach?: ModelRef }
}

export interface Lobby {
  size: 2 | 3 | 4 | 5 | 6
  blinds: 0 | 1 | 2
  picks: string[]
}

export interface ChatMessage {
  id: string
  kind: 'sys' | 'act' | 'msg'
  from?: string
  text?: string
  act?: string
  autopilot?: boolean
  replyTo?: string
  triggers: boolean
  at: number
}

export type LineKind = 'raise' | 'call' | 'check' | 'fold' | 'win' | 'chat'

export interface Persona {
  id: string
  name: string
  tag: string
  ini: string
  hue: number
  desc: string
  profile: { tight: number; aggr: number; bluff: number; call: number }
  talk: number
  prompt: string
  lines: Partial<Record<LineKind, string[]>>
}

export interface HandPlayer {
  id: string
  personaId?: string
  name: string
  hole: Card[] | null
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
  autopilot?: boolean
}

export interface HandRecord {
  hand: number
  sb: number
  bb: number
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

// 与 engine/poker.ts 的 Legal 同构（结构兼容）。Renderer 不能引用主进程模块，故在此另行声明。
export interface Legal {
  toCall: number
  canCheck: boolean
  minTo: number
  maxTo: number
  canRaise: boolean
  bet: number
  stack: number
}

export interface SeatViewPublic {
  name: string
  personaId?: string
  tag: string
  ini: string
  hue: number
  stack: number
  bet: number
  isDealer: boolean
  folded: boolean
  out: boolean
  allin: boolean
  status: string
  statusTone: 'muted' | 'blue' | 'green'
  autopilot: boolean
  thinking: boolean
  winner: boolean
  cards?: Card[]
  hasCards: boolean
  bubble?: string
}

export interface CoachAlert {
  level: 'hint' | 'pause'
  message: string
}

export interface BreakerState {
  opponent: boolean
  coach: boolean
}

export interface TableView {
  title: string
  bb: number
  handNo: number
  street: Street | 'idle'
  board: Card[]
  pot: number
  seats: SeatViewPublic[]
  hero: { legal: Legal; toCall: number; isTurn: boolean; defaultRaiseTo: number; presets: { label: string; to: number }[] }
  paused: boolean
  done: boolean
  runout: boolean
  result: { text: string; sub: string; heroWon: boolean; net: number } | null
  heroBust: boolean
  nums: { eq: number; need: number; outs: number | null; handName: string; sugg: string; stale: boolean } | null
  coachLoading: boolean
  autopilotCount: number
  breaker: BreakerState
  alert: CoachAlert | null
  guided: boolean
}

export interface CoachEntry {
  role: 'user' | 'assistant'
  text: string
  requestId: string
  interrupted?: boolean
}

export interface AgentCall {
  role: 'opponent' | 'coach'
  modelId: string
  ms: number
  ok: boolean
}

export interface Bootstrap {
  settings: Settings
  lobby: Lobby
  bankroll: number
  onboarded: boolean
  personas: (Persona & { promptOverride?: string })[]
  providers: ProviderPublic[]
  view: TableView | null
  lastCall: AgentCall | null
  coachThread: CoachEntry[]
  chat: ChatMessage[]
}

export interface TableStart {
  size: Lobby['size']
  blinds: Lobby['blinds']
  picks: string[]
  guided: boolean
}

export interface Commands {
  'app.bootstrap': () => Bootstrap
  'settings.update': (patch: Partial<Settings>) => Settings
  'lobby.update': (patch: Partial<Lobby>) => Lobby
  'persona.setPrompt': (personaId: string, prompt: string) => void
  'persona.resetPrompt': (personaId: string) => void
  'provider.save': (input: ProviderInput) => ProviderPublic
  'provider.delete': (id: string) => void
  'provider.test': (input: { providerId: string; modelId: string }) => { ok: boolean; supportsRequired?: boolean; error?: string }
  'provider.registry': () => { kind: string; name: string; models: string[] }[]
  'table.start': (opts: TableStart) => void
  'table.heroAct': (a: { type: 'fold' | 'call' | 'raise'; to?: number }) => void
  'table.nextHand': () => void
  'table.rebuy': () => void
  'table.leave': () => void
  'table.resume': () => void
  'table.retryModels': () => void
  'chat.send': (text: string) => void
  'coach.ask': (requestId: string, text: string) => void
  'hands.list': () => HandSummary[]
  'hands.get': (id: number) => { record: HandRecord; review?: string } | null
  'hands.review': (id: number) => void
  'data.clearHistory': () => void
  'data.resetMemory': () => void
  'onboarding.done': () => void
}

export interface Events {
  // null：已离桌
  'table:view': TableView | null
  'chat:append': ChatMessage
  'coach:delta': { requestId: string; text: string }
  // error：'interrupted' 被新提问中断；'not_configured' | 'breaker' 未发起；'failed' 超时或出错
  'coach:done': { requestId: string; ok: boolean; error?: 'interrupted' | 'not_configured' | 'breaker' | 'failed' }
  'review:done': { handId: number; text?: string; error?: string }
  bankroll: number
  'hands:changed': void
  'agent:last': AgentCall
}

// bootstrap 的 chat 快照与之后的 chat:append 可能重叠，Renderer 按消息 id 去重
export interface RiverApi {
  invoke<K extends keyof Commands>(cmd: K, ...args: Parameters<Commands[K]>): Promise<Awaited<ReturnType<Commands[K]>>>
  on<K extends keyof Events>(event: K, cb: (payload: Events[K]) => void): () => void
}
