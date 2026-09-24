import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import * as db from '../src/main/db'
import type { HandRecord } from '../src/shared/types'
import { dropTempDb, tempDb } from './table-helpers'

const crypto = {
  encrypt: (t: string) => Buffer.from('enc:' + t),
  decrypt: (b: Buffer) => b.toString().slice(4)
}

let dir: string
let url: string

beforeEach(async () => void ({ url, dir } = await tempDb(crypto)))
afterEach(dropTempDb)

function hand(n: number, personaIds: string[], net = 10): HandRecord {
  return {
    hand: n, sb: 50, bb: 100, net, pot: 300, showdown: n % 2 === 0,
    hero: ['As', 'Kd'], board: ['2c', '7h', 'Td'],
    players: [
      { id: 'hero', name: '你', hole: ['As', 'Kd'], folded: false, handName: '', won: 0, net },
      ...personaIds.map((p) => ({ id: p, personaId: p, name: p, hole: null, folded: true, handName: '', won: 0, net: 0 }))
    ],
    log: [{ street: 'preflop', board: false, name: '你', label: '跟注 100' }],
    vpip: true, pfr: false
  }
}

describe('迁移', () => {
  it('重复执行不丢数据，user_version 为 2', async () => {
    await db.setBankroll(1234)
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(await db.getBankroll()).toBe(1234)
    const c = createClient({ url })
    const r = await c.execute('PRAGMA user_version')
    expect(Number(r.rows[0][0])).toBe(2)
    const t = await c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'river_%' ORDER BY name")
    expect(t.rows.map((x) => x.name)).toEqual(['river_hands', 'river_kv', 'river_memory', 'river_personas', 'river_providers', 'river_reviews', 'river_usage'])
    expect(String((await c.execute('PRAGMA journal_mode')).rows[0][0])).toBe('wal')
    c.close()
  })

  it('v1 库升级：旧提示词覆盖保留，旧设置字段不再下发', async () => {
    db.closeDb()
    const c = createClient({ url })
    // 模拟 v1：回退到只有 v1 表结构的库
    await c.batch([
      'DROP TABLE river_personas', 'DROP TABLE river_memory', 'DROP TABLE river_usage',
      'CREATE TABLE river_personas (persona_id TEXT PRIMARY KEY, prompt TEXT NOT NULL)',
      "INSERT INTO river_personas VALUES ('li', '旧提示词')",
      `INSERT INTO river_kv VALUES ('settings', '{"engine":"local","coachOn":false,"autoNext":false,"speed":2}')`,
      'PRAGMA user_version = 1'
    ], 'write')
    c.close()
    await db.initDb({ url, ...crypto })
    expect(db.getSettings()).toEqual({ ...{ speed: 1, coachPersona: 0, level: 'novice', hard: false, felt: 'green', feltCustom: '#2f6b55', back: 'red', fx: 'full', currency: 'cny', fxRate: null, models: {} }, speed: 2 })
    const li = db.personaOf('li')!
    expect(li).toMatchObject({ name: '阿狸', prompt: '旧提示词', builtin: true, edited: true, deleted: false })
    expect(db.personasCache.filter((p) => p.builtin)).toHaveLength(8)
  })
})

describe('kv', () => {
  it('默认值', async () => {
    expect(db.getSettings()).toEqual({ speed: 1, coachPersona: 0, level: 'novice', hard: false, felt: 'green', feltCustom: '#2f6b55', back: 'red', fx: 'full', currency: 'cny', fxRate: null, models: {} })
    expect(await db.getLobby()).toEqual({ size: 6, blinds: 1, picks: ['li', 'prof', 'bai', 'k', 'rock'], mode: 'coach' })
    expect(await db.getBankroll()).toBe(100000)
    expect(await db.getOnboarded()).toBe(false)
  })

  it('settings 部分更新合并，并持久化、同步缓存', async () => {
    await db.updateSettings({ speed: 2, models: { coach: { providerId: 'p', modelId: 'm' } } })
    await db.updateSettings({ hard: true, models: { opponent: { providerId: 'p', modelId: 'o' } } })
    const want = {
      speed: 2, coachPersona: 0, level: 'novice', hard: true, felt: 'green', feltCustom: '#2f6b55', back: 'red', fx: 'full', currency: 'cny', fxRate: null,
      models: { coach: { providerId: 'p', modelId: 'm' }, opponent: { providerId: 'p', modelId: 'o' } }
    }
    expect(db.getSettings()).toEqual(want)
    expect(db.settingsCache).toEqual(want)
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(db.getSettings()).toEqual(want)
  })

  it('并发的 settings / lobby 更新互不覆盖', async () => {
    await Promise.all([db.updateSettings({ speed: 2 }), db.updateSettings({ hard: true })])
    await Promise.all([db.updateLobby({ size: 3 }), db.updateLobby({ blinds: 2 })])
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(db.getSettings()).toMatchObject({ speed: 2, hard: true })
    expect(db.getLobby()).toEqual({ size: 3, blinds: 2, picks: ['li', 'prof', 'bai', 'k', 'rock'], mode: 'coach' })
  })

  it('lobby / onboarded', async () => {
    expect(await db.updateLobby({ size: 3, mode: 'free' })).toEqual({ size: 3, blinds: 1, picks: ['li', 'prof', 'bai', 'k', 'rock'], mode: 'free' })
    await db.setOnboarded(true)
    expect(await db.getOnboarded()).toBe(true)
  })
})

describe('角色', () => {
  it('内置角色：只存差异，恢复默认后回到种子', async () => {
    expect(db.personaOf('li')).toMatchObject({ name: '阿狸', builtin: true, edited: false })
    const li = db.personaOf('li')!
    await db.savePersona({ ...li, prompt: '新提示词', hue: 99 })
    expect(db.personaOf('li')).toMatchObject({ name: '阿狸', prompt: '新提示词', hue: 99, edited: true })
    await db.savePersona({ ...li })
    expect(db.personaOf('li')!.edited).toBe(false)
    await db.savePersona({ ...li, name: '狸猫' })
    await db.resetPersona('li')
    expect(db.personaOf('li')).toMatchObject({ name: '阿狸', edited: false })
  })

  it('删除内置角色可恢复；自建角色新建、修改、删除；记忆随角色删除', async () => {
    await db.deletePersona('k')
    expect(db.personaOf('k')!.deleted).toBe(true)
    await db.restorePersona('k')
    expect(db.personaOf('k')!.deleted).toBe(false)
    const c = await db.savePersona({ name: '新对手', tag: '自定义', ini: '新', hue: 25, desc: '', prompt: '你是……' })
    expect(c.id).toMatch(/^c/)
    expect(c).toMatchObject({ builtin: false, deleted: false })
    expect(db.personasCache[0].id).toBe(c.id)
    await db.savePersona({ ...c, name: '改名' })
    expect(db.personaOf(c.id)!.name).toBe('改名')
    await db.addMemory(c.id, '印象')
    await db.deletePersona(c.id)
    expect(db.personaOf(c.id)).toBeUndefined()
    expect(await db.memoryOf(c.id)).toEqual([])
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(db.personaOf('k')!.deleted).toBe(false)
  })
})

describe('记忆与用量', () => {
  it('每个 owner 只留最近 10 条，按时间顺序返回', async () => {
    for (let i = 0; i < 12; i++) await db.addMemory('li', 'm' + i)
    await db.addMemory('hero', 'h')
    expect(await db.memoryOf('li')).toEqual(Array.from({ length: 10 }, (_, i) => 'm' + (i + 2)))
    await db.clearMemory()
    expect(await db.memoryOf('hero')).toEqual([])
  })

  it('用量写入、列出、清零', async () => {
    const row = { at: 1, tableId: 't', handNo: 3, purpose: 'decide' as const, providerKind: 'anthropic', modelId: 'm', input: 10, output: 2, cached: null }
    await db.insertUsage(row)
    await db.insertUsage({ ...row, purpose: 'recap', input: null, output: null })
    expect(await db.listUsage()).toEqual([row, { ...row, purpose: 'recap', input: null, output: null }])
    await db.resetUsage()
    expect(await db.listUsage()).toEqual([])
    expect(await db.getUsageSince()).toBeGreaterThan(0)
  })

  it('价格缓存', async () => {
    expect(await db.getPriceCache()).toBeNull()
    await db.setPriceCache({ at: 1 })
    expect(await db.getPriceCache()).toEqual({ at: 1 })
  })
})

describe('手牌', () => {
  it('插入与倒序列表、getHand', async () => {
    const a = await db.insertHand('t1', hand(1, ['li']))
    const b = await db.insertHand('t1', hand(2, ['k'], -50))
    const list = await db.listHands()
    expect(list.map((h) => h.id)).toEqual([b, a])
    expect(list[0]).toMatchObject({ handNo: 2, hero: ['As', 'Kd'], net: -50, showdown: true, vpip: true, pfr: false })
    expect(typeof list[0].playedAt).toBe('number')
    expect(await db.getHand(a)).toEqual(hand(1, ['li']))
    expect(await db.getHand(999)).toBeNull()
  })

  it('clearHistory 后余额 100000，reviews 一并删除', async () => {
    const id = await db.insertHand('t', hand(1, ['li']))
    await db.saveReview(id, '打得好')
    expect(await db.getReview(id)).toBe('打得好')
    await db.setBankroll(5)
    await db.clearHistory()
    expect(await db.getBankroll()).toBe(100000)
    expect(await db.listHands()).toEqual([])
    expect(await db.getReview(id)).toBeNull()
  })
})

describe('提供方', () => {
  it('脱敏结果不含明文，keyTail 为末 4 位，密钥可由注入的 decrypt 取回', async () => {
    const p = await db.saveProvider({ name: 'A', kind: 'anthropic', baseUrl: 'http://ignored', apiKey: 'sk-secret-1234' })
    expect(p).toEqual({ id: p.id, name: 'A', kind: 'anthropic', keyTail: '1234', needsKey: false, supportsRequired: null })
    expect(JSON.stringify(p)).not.toContain('sk-secret')
    expect(JSON.stringify(db.listProviders())).not.toContain('sk-secret')
    expect(db.getProviderSecret(p.id)).toBe('sk-secret-1234')
    expect(db.providersCache.get(p.id)?.baseUrl).toBeUndefined()
  })

  it('openai-compatible 必须有 baseUrl，apiKey 可空；内置提供方必须有 key', async () => {
    await expect(db.saveProvider({ name: 'O', kind: 'openai-compatible' })).rejects.toThrow()
    await expect(db.saveProvider({ name: 'A', kind: 'openai' })).rejects.toThrow()
    const o = await db.saveProvider({ name: 'O', kind: 'openai-compatible', baseUrl: 'http://localhost:11434/v1' })
    expect(o).toMatchObject({ baseUrl: 'http://localhost:11434/v1', keyTail: null })
    expect(db.getProviderSecret(o.id)).toBeUndefined()
  })

  it('更新时不带 key 保留原 key；setSupportsRequired 与 needsKey 合并；重启后缓存恢复', async () => {
    const p = await db.saveProvider({ name: 'A', kind: 'openai', apiKey: 'sk-abcd' })
    const q = await db.saveProvider({ id: p.id, name: 'B', kind: 'openai' })
    expect(q).toMatchObject({ id: p.id, name: 'B', keyTail: 'abcd' })
    await db.setSupportsRequired(p.id, false)
    expect(db.listProviders(new Set([p.id]))).toEqual([{ ...q, needsKey: true, supportsRequired: false }])
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(db.listProviders()).toEqual([{ ...q, supportsRequired: false }])
    expect(db.getProviderSecret(p.id)).toBe('sk-abcd')
  })

  it('kind 或 baseUrl 变化时 supportsRequired 重置，只换 key 保留', async () => {
    const p = await db.saveProvider({ name: 'O', kind: 'openai-compatible', baseUrl: 'http://a/v1' })
    await db.setSupportsRequired(p.id, true)
    expect((await db.saveProvider({ id: p.id, name: 'O', kind: 'openai-compatible', baseUrl: 'http://a/v1', apiKey: 'k-new1' })).supportsRequired).toBe(true)
    expect((await db.saveProvider({ id: p.id, name: 'O', kind: 'openai-compatible', baseUrl: 'http://b/v1' })).supportsRequired).toBeNull()
    await db.setSupportsRequired(p.id, false)
    expect((await db.saveProvider({ id: p.id, name: 'O', kind: 'openai' })).supportsRequired).toBeNull()
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(db.listProviders()[0]).toMatchObject({ kind: 'openai', supportsRequired: null, keyTail: 'new1' })
  })

  it('getProviderSecret 在解密失败时抛出', async () => {
    const p = await db.saveProvider({ name: 'A', kind: 'openai', apiKey: 'k1' })
    db.closeDb()
    await db.initDb({ url, encrypt: crypto.encrypt, decrypt: () => { throw new Error('keychain changed') } })
    expect(() => db.getProviderSecret(p.id)).toThrow('keychain changed')
  })

  it('deleteProvider 与 updateSettings 并发后 models 不残留已删引用', async () => {
    const a = await db.saveProvider({ name: 'A', kind: 'openai', apiKey: 'k1' })
    await db.updateSettings({ models: { opponent: { providerId: a.id, modelId: 'x' } } })
    await Promise.all([db.deleteProvider(a.id), db.updateSettings({ speed: 0 })])
    expect(db.getSettings()).toMatchObject({ speed: 0, models: {} })
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(db.getSettings()).toMatchObject({ speed: 0, models: {} })
    expect(db.getSettings().models.opponent).toBeUndefined()
  })

  it('删除被引用的提供方后清空对应角色的 models', async () => {
    const a = await db.saveProvider({ name: 'A', kind: 'openai', apiKey: 'k1' })
    const b = await db.saveProvider({ name: 'B', kind: 'openai', apiKey: 'k2' })
    await db.updateSettings({ models: { opponent: { providerId: a.id, modelId: 'x' }, coach: { providerId: b.id, modelId: 'y' } } })
    await db.deleteProvider(a.id)
    expect(db.getSettings().models).toEqual({ coach: { providerId: b.id, modelId: 'y' } })
    expect(db.listProviders().map((p) => p.id)).toEqual([b.id])
    expect(db.providersCache.has(a.id)).toBe(false)
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(db.getSettings().models).toEqual({ coach: { providerId: b.id, modelId: 'y' } })
  })
})

describe('写锁冲突', () => {
  async function holdWriteLock() {
    const other = createClient({ url })
    const tx = await other.transaction('write')
    await tx.execute("INSERT INTO river_kv (key, value) VALUES ('lock', '1')")
    return async () => {
      await tx.rollback()
      other.close()
    }
  }

  it('锁在重试期间释放则写入成功', async () => {
    const release = await holdWriteLock()
    setTimeout(release, 150)
    await db.updateSettings({ speed: 2 })
    db.closeDb()
    await db.initDb({ url, ...crypto })
    expect(db.getSettings().speed).toBe(2)
  })

  it('BUSY 重建 client 时，同一轮微任务里的并发读不被 CLIENT_CLOSED 拒绝', async () => {
    const release = await holdWriteLock()
    const w = db.updateSettings({ speed: 2 })
    const reads = Array.from({ length: 12 }, async (_, depth) => {
      for (let i = 0; i < depth; i++) await Promise.resolve()
      return db.getBankroll()
    })
    expect(await Promise.all(reads)).toEqual(Array(12).fill(100000))
    await release()
    await w
    expect(db.getSettings().speed).toBe(2)
  })

  it('退避中 closeDb + initDb 换库：旧写入不落到新库，写计数不被打乱', async () => {
    const release = await holdWriteLock()
    const stale = db.updateSettings({ speed: 2 })
    await new Promise((r) => setTimeout(r, 50))
    db.closeDb()
    const url2 = 'file:' + join(dir, 'river2.db')
    await db.initDb({ url: url2, ...crypto })
    await release()
    await expect(stale).rejects.toThrow('db closed or reopened')
    expect(db.getSettings().speed).toBe(1)

    // A 立即失败（NOT NULL），B 排在其后；计数若被打乱，会在 B 落库前就重载缓存
    const bad = { ...hand(1, []), hand: null } as unknown as HandRecord
    const [a, b] = await Promise.allSettled([db.insertHand('t', bad), db.updateLobby({ size: 3 })])
    expect(a.status).toBe('rejected')
    expect(b.status).toBe('fulfilled')
    expect(db.getLobby().size).toBe(3)

    db.closeDb()
    await db.initDb({ url: url2, ...crypto })
    expect(db.getSettings().speed).toBe(1)
    expect(db.getLobby().size).toBe(3)
  })

  it('重试耗尽后抛出 SQLITE_BUSY，缓存回到库中的值', async () => {
    const p = await db.saveProvider({ name: 'A', kind: 'openai', apiKey: 'k1' })
    await db.updateLobby({ size: 4 })
    const release = await holdWriteLock()
    let last = Date.now()
    let maxGap = 0
    const timer = setInterval(() => {
      maxGap = Math.max(maxGap, Date.now() - last)
      last = Date.now()
    }, 10)
    const results = await Promise.allSettled([
      db.updateSettings({ speed: 2, models: { coach: { providerId: p.id, modelId: 'm' } } }),
      db.updateLobby({ size: 2 }),
      db.saveProvider({ name: 'B', kind: 'openai', apiKey: 'k2' }),
      db.deleteProvider(p.id)
    ])
    clearInterval(timer)
    await release()
    // 等锁不能在主线程同步阻塞
    expect(maxGap).toBeLessThan(100)
    expect(results.every((r) => r.status === 'rejected' && /SQLITE_BUSY/.test(String(r.reason)))).toBe(true)
    expect(db.getSettings()).toEqual({ speed: 1, coachPersona: 0, level: 'novice', hard: false, felt: 'green', feltCustom: '#2f6b55', back: 'red', fx: 'full', currency: 'cny', fxRate: null, models: {} })
    expect(db.getLobby().size).toBe(4)
    expect(db.listProviders().map((x) => x.name)).toEqual(['A'])
  }, 15000)
})
