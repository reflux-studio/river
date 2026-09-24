import { randomUUID } from 'node:crypto'
import { createClient, type Client } from '@libsql/client'
import type { HandRecord, HandSummary, Lobby, ProviderInput, ProviderPublic, Settings } from '../../shared/types'

export interface ProviderRow {
  id: string
  name: string
  kind: string
  baseUrl?: string
  apiKeyEnc: Buffer | null
  keyTail: string | null
  supportsRequired: boolean | null
}

const DEFAULT_SETTINGS: Settings = { engine: 'llm', speed: 1, coachOn: true, coachPersona: 0, level: 'novice', hard: false, autoNext: true, models: {} }
const DEFAULT_LOBBY: Lobby = { size: 6, blinds: 1, picks: ['li', 'prof', 'bai', 'k', 'rock'] }
const DEFAULT_BANKROLL = 100000

const MIGRATIONS = [
  [
    'CREATE TABLE river_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    'CREATE TABLE river_personas (persona_id TEXT PRIMARY KEY, prompt TEXT NOT NULL)',
    `CREATE TABLE river_hands (id INTEGER PRIMARY KEY AUTOINCREMENT, table_id TEXT NOT NULL,
      hand_no INTEGER NOT NULL, played_at INTEGER NOT NULL, net INTEGER NOT NULL, record TEXT NOT NULL)`,
    'CREATE TABLE river_reviews (hand_id INTEGER PRIMARY KEY REFERENCES river_hands(id) ON DELETE CASCADE, text TEXT NOT NULL)',
    `CREATE TABLE river_providers (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
      base_url TEXT, api_key_enc BLOB, supports_required INTEGER)`
  ]
]

let url = ''
let client: Client | null = null
let encrypt: (text: string) => Buffer
let decrypt: (enc: Buffer) => string

export let settingsCache: Settings = DEFAULT_SETTINGS
export const providersCache = new Map<string, ProviderRow>()
let lobbyCache: Lobby = DEFAULT_LOBBY

function db(): Client {
  if (!client) throw new Error('db not initialized')
  return client
}

const isBusy = (e: unknown) => {
  const { code, message } = (e ?? {}) as { code?: string; message?: string }
  return /^SQLITE_(BUSY|LOCKED)/.test(code ?? '') || /database (table )?is locked/i.test(message ?? '')
}

// Mastra 的交互式写事务跨 await 持锁，业务写会撞上 SQLITE_BUSY。客户端不设 busy_timeout：
// 它在主线程同步等待，持锁的 Mastra 事务无法推进。改为异步退避重试（同 @mastra/libsql：5 次，100ms 起翻倍）。
// 每次 BUSY 后必须换掉整个 client：libsql 0.18 出错的语句不会被重置，那条连接此后的写入只停留在
// 未提交的隐式事务里——调用成功、别的连接却读不到，并一直持锁（evidence/T3/r3-busy.md）。
// 因此 Mastra 也不能与本模块共用 client：共用时无法丢弃被污染的连接。
// 旧 client 推迟到下一个宏任务再关：同一轮微任务里已拿到旧引用的读能做完，不会 CLIENT_CLOSED；
// 下一次写至少在 100ms 退避之后且重新取 db()，所以被污染的连接不会再接到写入。
// generation 在 initDb/closeDb 时递增：退避中的旧写入发现库已关闭或换库就放弃，不写进新库。
let generation = 0
async function withRetry<T>(fn: (c: Client) => Promise<T>, gen = generation): Promise<T> {
  for (let attempt = 1, backoff = 100; ; attempt++, backoff *= 2) {
    if (gen !== generation) throw new Error('db closed or reopened')
    try {
      return await fn(db())
    } catch (e) {
      if (!isBusy(e) || gen !== generation) throw e
      const old = db()
      client = createClient({ url })
      setImmediate(() => old.close())
      if (attempt >= 5) throw e
      await new Promise((r) => setTimeout(r, backoff))
    }
  }
}

// 读-改-写一律先基于缓存同步算出新值并更新缓存，再按调用顺序串行写库：
// 否则并发调用都从旧快照出发，后写覆盖先写（如删提供方与改设置并发时 models 残留已删引用）。
// 写库最终失败时缓存已领先于库；等队列清空（后续写入已基于这份缓存落库）再从库重载，保证两者一致。
let writeChain: Promise<unknown> = Promise.resolve()
let pendingWrites = 0
let cacheStale = false
function write<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  db() // 未初始化时同步抛出，不进入队列
  const gen = generation
  pendingWrites++
  const p = writeChain
    .then(() => withRetry(fn, gen))
    .catch((e) => {
      if (gen === generation) cacheStale = true
      throw e
    })
    .finally(async () => {
      if (gen !== generation) return
      if (--pendingWrites > 0 || !cacheStale) return
      cacheStale = false
      try {
        await loadCaches()
      } catch {
        // 重载失败不改变本次写入的结果；留到下次队列清空再重载
        cacheStale = true
      }
      // 重载期间新入队的写入已改过缓存，又被重载覆盖；让它们落库后再重载一次
      if (pendingWrites > 0) cacheStale = true
    })
  writeChain = p.catch(() => {})
  return p
}

// Mastra 的 LibSQLStore 用同一个 url 自建 client，不要共用本模块的 client（原因见 withRetry）
export async function initDb(opts: { url: string; encrypt: (text: string) => Buffer; decrypt: (enc: Buffer) => string }) {
  encrypt = opts.encrypt
  decrypt = opts.decrypt
  closeDb()
  url = opts.url
  client = createClient({ url })
  const version = Number((await client.execute('PRAGMA user_version')).rows[0][0])
  for (let v = version; v < MIGRATIONS.length; v++) {
    // PRAGMA 与建表同在一个事务里，失败时版本号不会前移
    await withRetry((c) => c.batch([...MIGRATIONS[v], `PRAGMA user_version = ${v + 1}`], 'write'))
  }
  await loadCaches()
}

async function loadCaches() {
  settingsCache = await getKv('settings', DEFAULT_SETTINGS)
  lobbyCache = await getKv('lobby', DEFAULT_LOBBY)
  const tails = await db().execute("SELECT key, value FROM river_kv WHERE key LIKE 'provider_tail:%'")
  const tailOf = new Map(tails.rows.map((r) => [String(r.key).slice('provider_tail:'.length), JSON.parse(String(r.value)) as string]))
  const rows = (await db().execute('SELECT * FROM river_providers')).rows
  providersCache.clear()
  for (const r of rows) {
    const id = String(r.id)
    providersCache.set(id, {
      id,
      name: String(r.name),
      kind: String(r.kind),
      baseUrl: r.base_url == null ? undefined : String(r.base_url),
      apiKeyEnc: r.api_key_enc == null ? null : Buffer.from(r.api_key_enc as ArrayBuffer),
      keyTail: tailOf.get(id) ?? null,
      supportsRequired: r.supports_required == null ? null : Boolean(r.supports_required)
    })
  }
}

export function closeDb() {
  generation++
  writeChain = Promise.resolve()
  pendingWrites = 0
  cacheStale = false
  client?.close()
  client = null
}

async function getKv<T>(key: string, fallback: T): Promise<T> {
  const r = await db().execute({ sql: 'SELECT value FROM river_kv WHERE key = ?', args: [key] })
  const value = r.rows.length ? JSON.parse(String(r.rows[0].value)) : undefined
  // 对象与默认值合并：旧数据在新增字段后仍完整，调用方也拿不到默认值本身的引用
  if (typeof fallback === 'object') return { ...fallback, ...value }
  return value ?? fallback
}

const kvUpsert = (key: string, value: unknown) => ({
  sql: 'INSERT INTO river_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  args: [key, JSON.stringify(value)]
})

async function setKv(key: string, value: unknown) {
  await write((c) => c.execute(kvUpsert(key, value)))
}

export function getSettings(): Settings {
  return settingsCache
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...settingsCache, ...patch, models: { ...settingsCache.models, ...patch.models } }
  settingsCache = next
  await setKv('settings', next)
  return next
}

export function getLobby(): Lobby {
  return lobbyCache
}

export async function updateLobby(patch: Partial<Lobby>): Promise<Lobby> {
  const next = { ...lobbyCache, ...patch }
  lobbyCache = next
  await setKv('lobby', next)
  return next
}

export const getBankroll = () => getKv('bankroll', DEFAULT_BANKROLL)
export const setBankroll = (n: number) => setKv('bankroll', n)
export const getOnboarded = () => getKv('onboarded', false)
export const setOnboarded = (v: boolean) => setKv('onboarded', v)

export async function getPromptOverrides(): Promise<Record<string, string>> {
  const r = await db().execute('SELECT persona_id, prompt FROM river_personas')
  return Object.fromEntries(r.rows.map((x) => [String(x.persona_id), String(x.prompt)]))
}

export async function setPrompt(personaId: string, prompt: string) {
  await write((c) => c.execute({
    sql: 'INSERT INTO river_personas (persona_id, prompt) VALUES (?, ?) ON CONFLICT(persona_id) DO UPDATE SET prompt = excluded.prompt',
    args: [personaId, prompt]
  }))
}

export async function resetPrompt(personaId: string) {
  await write((c) => c.execute({ sql: 'DELETE FROM river_personas WHERE persona_id = ?', args: [personaId] }))
}

export async function insertHand(tableId: string, record: HandRecord): Promise<number> {
  const r = await write((c) => c.execute({
    sql: 'INSERT INTO river_hands (table_id, hand_no, played_at, net, record) VALUES (?, ?, ?, ?, ?)',
    args: [tableId, record.hand, Date.now(), record.net, JSON.stringify(record)]
  }))
  return Number(r.lastInsertRowid)
}

export async function listHands(): Promise<HandSummary[]> {
  const r = await db().execute('SELECT id, hand_no, played_at, net, record FROM river_hands ORDER BY id DESC')
  return r.rows.map((x) => {
    const rec = JSON.parse(String(x.record)) as HandRecord
    return { id: Number(x.id), handNo: Number(x.hand_no), playedAt: Number(x.played_at), hero: rec.hero, net: Number(x.net), showdown: rec.showdown }
  })
}

export async function getHand(id: number): Promise<HandRecord | null> {
  const r = await db().execute({ sql: 'SELECT record FROM river_hands WHERE id = ?', args: [id] })
  return r.rows.length ? JSON.parse(String(r.rows[0].record)) : null
}

export async function recentHands(n: number): Promise<HandRecord[]> {
  const r = await db().execute({ sql: 'SELECT record FROM river_hands ORDER BY id DESC LIMIT ?', args: [n] })
  return r.rows.map((x) => JSON.parse(String(x.record)))
}

export async function handsForPersona(personaId: string, n: number): Promise<HandRecord[]> {
  const r = await db().execute({
    sql: `SELECT record FROM river_hands
          WHERE EXISTS (SELECT 1 FROM json_each(record, '$.players') WHERE json_extract(value, '$.personaId') = ?)
          ORDER BY id DESC LIMIT ?`,
    args: [personaId, n]
  })
  return r.rows.map((x) => JSON.parse(String(x.record)))
}

export async function saveReview(handId: number, text: string) {
  await write((c) => c.execute({
    sql: 'INSERT INTO river_reviews (hand_id, text) VALUES (?, ?) ON CONFLICT(hand_id) DO UPDATE SET text = excluded.text',
    args: [handId, text]
  }))
}

export async function getReview(handId: number): Promise<string | null> {
  const r = await db().execute({ sql: 'SELECT text FROM river_reviews WHERE hand_id = ?', args: [handId] })
  return r.rows.length ? String(r.rows[0].text) : null
}

export async function clearHistory() {
  // 显式删 reviews：libsql 客户端是连接池，PRAGMA foreign_keys 只作用于单个连接，不能依赖 ON DELETE CASCADE
  await write((c) => c.batch(['DELETE FROM river_reviews', 'DELETE FROM river_hands', kvUpsert('bankroll', DEFAULT_BANKROLL)], 'write'))
}

function toPublic(p: ProviderRow, needsKey = false): ProviderPublic {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    ...(p.baseUrl !== undefined && { baseUrl: p.baseUrl }),
    keyTail: p.keyTail,
    needsKey,
    supportsRequired: p.supportsRequired
  }
}

export function listProviders(needsKeySet: ReadonlySet<string> = new Set()): ProviderPublic[] {
  return [...providersCache.values()].map((p) => toPublic(p, needsKeySet.has(p.id)))
}

export async function saveProvider(input: ProviderInput): Promise<ProviderPublic> {
  const compatible = input.kind === 'openai-compatible'
  const baseUrl = compatible ? input.baseUrl?.trim() || undefined : undefined
  if (compatible && !baseUrl) throw new Error('openai-compatible 需要 baseUrl')
  const prev = input.id ? providersCache.get(input.id) : undefined
  const apiKey = input.apiKey?.trim() || undefined
  const apiKeyEnc = apiKey ? encrypt(apiKey) : (prev?.apiKeyEnc ?? null)
  if (!compatible && !apiKeyEnc) throw new Error('需要 API key')
  const row: ProviderRow = {
    id: input.id ?? randomUUID(),
    name: input.name,
    kind: input.kind,
    baseUrl,
    apiKeyEnc,
    // 末 4 位在保存时从明文取；之后解密可能失败（钥匙串变化），列表仍要能显示
    keyTail: apiKey ? apiKey.slice(-4) : (prev?.keyTail ?? null),
    // 测试结果描述的是端点能否接受 toolChoice:'required'；换端点后旧结论失效，只换 key 仍有效
    supportsRequired: prev && prev.kind === input.kind && prev.baseUrl === baseUrl ? prev.supportsRequired : null
  }
  providersCache.set(row.id, row)
  await write((c) => c.batch(
    [
      {
        sql: `INSERT INTO river_providers (id, name, kind, base_url, api_key_enc, supports_required) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, base_url = excluded.base_url,
                api_key_enc = excluded.api_key_enc, supports_required = excluded.supports_required`,
        args: [row.id, row.name, row.kind, row.baseUrl ?? null, row.apiKeyEnc, row.supportsRequired == null ? null : Number(row.supportsRequired)]
      },
      row.keyTail == null
        ? { sql: 'DELETE FROM river_kv WHERE key = ?', args: ['provider_tail:' + row.id] }
        : kvUpsert('provider_tail:' + row.id, row.keyTail)
    ],
    'write'
  ))
  return toPublic(row)
}

export async function setSupportsRequired(id: string, value: boolean) {
  const p = providersCache.get(id)
  if (p) providersCache.set(id, { ...p, supportsRequired: value })
  await write((c) => c.execute({ sql: 'UPDATE river_providers SET supports_required = ? WHERE id = ?', args: [Number(value), id] }))
}

export async function deleteProvider(id: string) {
  const models = { ...settingsCache.models }
  if (models.opponent?.providerId === id) delete models.opponent
  if (models.coach?.providerId === id) delete models.coach
  const settings = { ...settingsCache, models }
  providersCache.delete(id)
  settingsCache = settings
  await write((c) => c.batch(
    [
      { sql: 'DELETE FROM river_providers WHERE id = ?', args: [id] },
      { sql: 'DELETE FROM river_kv WHERE key = ?', args: ['provider_tail:' + id] },
      kvUpsert('settings', settings)
    ],
    'write'
  ))
}

// 解密失败会抛出，由调用方（T4）据此标记 needsKey
export function getProviderSecret(id: string): string | undefined {
  const enc = providersCache.get(id)?.apiKeyEnc
  return enc ? decrypt(enc) : undefined
}
