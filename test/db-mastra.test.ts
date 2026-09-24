import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { createClient } from '@libsql/client'
import { LibSQLStore } from '@mastra/libsql'
import * as db from '../src/main/db'
import type { HandRecord } from '../src/shared/types'

const crypto = { encrypt: (t: string) => Buffer.from(t), decrypt: (b: Buffer) => b.toString() }
let dir: string
let store: LibSQLStore

afterEach(async () => {
  await store.close()
  db.closeDb()
  rmSync(dir, { recursive: true, force: true })
})

const record = (n: number): HandRecord => ({
  hand: n, sb: 50, bb: 100, net: 0, pot: 150, showdown: false, hero: ['As', 'Kd'], board: [],
  players: [], log: [], vpip: false, pfr: false
})

it('与同文件的 LibSQLStore 并发写入时，业务写与 Mastra 写都落库', async () => {
  dir = mkdtempSync(join(tmpdir(), 'river-mastra-'))
  const url = 'file:' + join(dir, 'river.db')
  await db.initDb({ url, ...crypto })
  store = new LibSQLStore({ id: 'river', url })
  await store.init()
  const mem = (await store.getStore('memory'))!
  const resourceId = 'opponent:li'

  // deleteMessages 用交互式写事务，跨多个 await 持锁；业务写在微任务间隙插入时会撞上 SQLITE_BUSY
  const mastra = (async () => {
    for (let i = 0; i < 100; i++) {
      const threadId = randomUUID()
      const now = new Date()
      await mem.saveThread({ thread: { id: threadId, resourceId, title: 't', createdAt: now, updatedAt: now, metadata: {} } })
      const messages = Array.from({ length: 20 }, (_, j) => ({
        id: randomUUID(), threadId, resourceId, role: 'user' as const, type: 'v2' as const,
        createdAt: new Date(now.getTime() + j), content: { format: 2 as const, parts: [{ type: 'text' as const, text: 'x' }] }
      }))
      await mem.saveMessages({ messages })
      await mem.updateResource({ resourceId, workingMemory: '# wm ' + i })
      await mem.deleteMessages(messages.slice(0, 10).map((m) => m.id))
    }
  })()
  const business = Array.from({ length: 4 }, async (_, w) => {
    for (let i = 0; i < 50; i++) {
      await db.insertHand('t', record(w * 100 + i))
      await db.updateSettings({ speed: ((w + i) % 3) as 0 | 1 | 2 })
      await Promise.resolve()
    }
  })
  await Promise.all([mastra, ...business])

  // 用新连接核对：被污染的连接上的写入对自己可见，对别的连接不可见
  const fresh = createClient({ url })
  expect(Number((await fresh.execute('SELECT count(*) FROM river_hands')).rows[0][0])).toBe(200)
  expect((await fresh.execute({ sql: 'SELECT workingMemory FROM mastra_resources WHERE id = ?', args: [resourceId] })).rows[0].workingMemory).toBe('# wm 99')
  fresh.close()
  const cached = db.getSettings()
  db.closeDb()
  await db.initDb({ url, ...crypto })
  expect(db.getSettings()).toEqual(cached)
}, 30000)
