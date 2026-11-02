import assert from 'node:assert/strict'
import { RiverClient, webSocketTransport, type KeyValueStore } from '../../../packages/client/src/index'
import { ArchivePageSchema } from '@river/protocol'
function memory(): KeyValueStore {
  const values = new Map<string, unknown>()
  return {
    async get<T>(key: string) {
      return values.get(key) as T
    },
    async set(key, value) {
      values.set(key, value)
    },
    async entries<T>(prefix: string) {
      return [...values].filter(([key]) => key.startsWith(prefix)).map(([, value]) => value as T)
    }
  }
}
async function wait(client: RiverClient | RiverClient[], check: () => boolean) {
  if (check()) return
  const clients = Array.isArray(client) ? client : [client]
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout)
      for (const off of subscriptions) off()
    }
    const timeout = setTimeout(() => {
      finish()
      reject(new Error('WS smoke timed out'))
    }, 3000)
    const subscriptions = clients.map((item) =>
      item.subscribe(() => {
        if (check()) {
          finish()
          resolve()
        }
      })
    )
  })
}
const url = process.argv[2] ?? 'ws://localhost:8787/ws'
const stores = [memory(), memory()]
const clients = stores.map((store) => new RiverClient(webSocketTransport(url), store, url))
try {
  for (const client of clients) {
    await client.connect()
    await wait(client, () => client.getSnapshot().connected)
  }
  const profile = (name: string) => ({
    profileId: crypto.randomUUID(),
    name,
    ini: name[0],
    hue: 180,
    locale: 'zh' as const
  })
  await clients[0].create(profile('WS host'), {
    capacity: 10,
    smallBlind: 5,
    bigBlind: 10,
    defaultBuyIn: 1000,
    humanTurnMs: 30000,
    disconnectGraceMs: 60000,
    showingMs: 10000,
    coachAllowed: false,
    revealAllAfterHand: false,
    spectatorVision: true
  })
  await clients[0].whenBound()
  const roomId = clients[0].getSnapshot().view!.roomId
  await clients[1].join(roomId, profile('WS guest'))
  await clients[1].whenBound()
  for (const client of clients) await client.command('funds.buyIn', { amount: 1000 })
  await clients[1].command('seat.sit', { seatId: 1 })
  await clients[0].command('room.start', {})
  const handId = clients[0].getSnapshot().view!.hand!.handId
  for (let count = 0; count < 20 && clients[0].getSnapshot().view!.phase !== 'showing'; count++) {
    await wait(
      clients,
      () =>
        clients.some((client) => client.getSnapshot().view?.hand?.decision) ||
        clients[0].getSnapshot().view!.phase === 'showing'
    )
    if (clients[0].getSnapshot().view!.phase === 'showing') break
    const actor = clients.find((client) => client.getSnapshot().view?.hand?.decision)
    assert.ok(actor, 'current actor receives a private decision')
    const decision = actor.getSnapshot().view!.hand!.decision!
    await actor.command('hand.act', {
      handId: decision.handId,
      decisionId: decision.decisionId,
      legalRevision: decision.legalRevision,
      action: decision.legal.canCheck ? 'check' : 'call'
    })
  }
  assert.equal(clients[0].getSnapshot().view!.hand!.board.length, 5)
  const page = ArchivePageSchema.parse((await clients[0].command('archive.get', { afterRevision: 0 })).result)
  assert.ok(
    page.items.some((change) => change.data.type === 'hand.upsert'),
    'settled hand reaches the client over WS'
  )
  clients[1].close()
  const resumed = new RiverClient(webSocketTransport(url), stores[1], url)
  clients[1] = resumed
  await resumed.connect()
  await resumed.whenBound()
  assert.equal(resumed.getSnapshot().view!.hand!.handId, handId)
  await clients[0].command('room.close', {})
  await wait(resumed, () => resumed.getSnapshot().view?.phase === 'closed')
  await clients[0].forgetRoom()
  await wait(clients[0], () => clients[0].getSnapshot().connected)
  assert.equal(clients[0].getSnapshot().view, null)
  console.log('WS smoke passed: create/join/buy-in/ten-seat view/full hand/history/reconnect/close/return to lobby')
} finally {
  for (const client of clients) client.close()
}
