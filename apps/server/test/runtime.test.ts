import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RoomRuntime, type RuntimeResult } from '@river/runtime'
import { SqliteRoomStore } from '@river/storage/sqlite'
import type { Bound, CommandType, Projection } from '@river/protocol'

const rules = {
  capacity: 10 as const,
  smallBlind: 5,
  bigBlind: 10,
  defaultBuyIn: 1000,
  humanTurnMs: 30000,
  disconnectGraceMs: 60000,
  showingMs: 10000,
  coachAllowed: false,
  revealAllAfterHand: false,
  spectatorVision: false
}
let directory: string
let database: ReturnType<typeof createClient>
let store: SqliteRoomStore
let runtime: RoomRuntime
let views: Map<string, Projection>
let players: Array<{ credential: { controllerId: string; resumeSecret: string }; bound: Bound }>
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
function host() {
  return new RoomRuntime({
    store,
    clock: {
      now: Date.now,
      setTimeout,
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
    random: () => 0.41,
    id: randomUUID,
    hash,
    serverEpoch: randomUUID(),
    deliver(projections) {
      for (const p of projections) views.set(p.controllerId, p)
    }
  })
}
function bound(result: RuntimeResult) {
  if (result.kind !== 'bound') throw new Error(JSON.stringify(result))
  return result.bound
}
async function command(player: number, type: CommandType, payload: unknown = {}, commandId = randomUUID()) {
  const p = players[player]
  const result = await runtime.submit(
    p.bound.controllerId,
    {
      kind: 'command',
      protocol: 1,
      commandId,
      roomId: p.bound.roomId,
      serverEpoch: p.bound.serverEpoch,
      type,
      payload
    },
    p.bound.sessionGeneration
  )
  if (result.kind === 'reject') throw new Error(JSON.stringify(result.reject))
  return result
}
async function table(count = 2, buyIn = 1000, start = true) {
  for (let i = 0; i < count; i++) {
    const credential = { controllerId: randomUUID(), resumeSecret: randomUUID() + randomUUID() }
    const profile = { profileId: randomUUID(), name: `player ${i}`, ini: String(i), hue: 100, locale: 'zh' as const }
    const result =
      i === 0
        ? await runtime.createRoom({ commandId: randomUUID(), credential, profile, rules })
        : await runtime.joinRoom({ commandId: randomUUID(), roomId: players[0].bound.roomId, credential, profile })
    players.push({ credential, bound: bound(result) })
    await command(i, 'funds.buyIn', { amount: buyIn })
    if (i > 0) await command(i, 'seat.sit', { seatId: i })
  }
  if (start) await command(0, 'room.start')
}
async function checkDown() {
  for (let count = 0; count < 100; count++) {
    const state = await runtime.getRoom(players[0].bound.roomId)
    if (state!.phase === 'showing') return state!
    const decision = state!.decision!
    const index = players.findIndex((p) => p.bound.participantId === decision.participantId)
    const projection = views.get(players[index].bound.controllerId)!
    const d = projection.view.hand!.decision!
    await command(index, 'hand.act', {
      handId: d.handId,
      decisionId: d.decisionId,
      legalRevision: d.legalRevision,
      action: d.legal.canCheck ? 'check' : 'call'
    })
  }
  throw new Error('hand did not finish')
}
beforeEach(async () => {
  vi.useFakeTimers()
  directory = await mkdtemp(join(tmpdir(), 'river-room-'))
  database = createClient({ url: 'file:' + join(directory, 'rooms.db') })
  store = new SqliteRoomStore(database)
  await store.initialize()
  views = new Map()
  players = []
  runtime = host()
  await runtime.restore()
})
afterEach(async () => {
  vi.useRealTimers()
  database.close()
  await rm(directory, { recursive: true })
})

it('plays ten players through every street, keeps private cards private, and saves one settled hand', async () => {
  await table(10)
  for (const projection of views.values())
    expect(
      projection.view.participants.filter((p) => p.hole?.some((slot) => slot.visibility === 'known'))
    ).toHaveLength(1)
  const state = await checkDown()
  expect(state.engine!.board).toHaveLength(5)
  expect(Object.values(state.participants).reduce((sum, p) => sum + p.stack, 0)).toBe(10000)
  const history = state.history[players[0].bound.controllerId].filter((entry) => entry.data.type === 'hand.upsert')
  expect(history).toHaveLength(1)
  expect((await store.load(state.roomId))!.snapshot.phase).toBe('showing')
})

it('deduplicates concurrent buy-in retries and makes state.sync read-only', async () => {
  await table()
  const id = randomUUID()
  await Promise.all([command(0, 'funds.buyIn', { amount: 50 }, id), command(0, 'funds.buyIn', { amount: 50 }, id)])
  const before = (await runtime.getRoom(players[0].bound.roomId))!
  expect(before.participants[players[0].bound.participantId].buyInTotal).toBe(1050)
  await command(0, 'state.sync')
  expect((await runtime.getRoom(before.roomId))!.version).toBe(before.version)
})

it('restores the exact deck and current decision after restart, then completes the hand', async () => {
  await table()
  const before = (await runtime.getRoom(players[0].bound.roomId))!
  runtime = host()
  await runtime.restore()
  for (const p of players) p.bound = bound(await runtime.resume({ roomId: before.roomId, credential: p.credential }))
  const after = (await runtime.getRoom(before.roomId))!
  expect(after.engine).toEqual(before.engine)
  expect(after.decision!.decisionId).toBe(before.decision!.decisionId)
  await checkDown()
})

it('folds a departing non-actor immediately without returning committed chips', async () => {
  await table(3)
  const before = (await runtime.getRoom(players[0].bound.roomId))!
  const target = players.findIndex((p) => p.bound.participantId !== before.decision!.participantId)
  const seat = before.participants[players[target].bound.participantId].seatId!
  const paid = before.engine!.seats[seat]!.totalIn
  await command(target, 'room.leave')
  const after = (await runtime.getRoom(before.roomId))!
  expect(after.engine!.seats[seat]!.folded).toBe(true)
  expect(after.engine!.seats[seat]!.totalIn).toBe(paid)
  const done = await checkDown()
  expect(done.engine!.wins.some((win) => win.seat === seat)).toBe(false)
})

it('does not grant a free check after cashing out all available chips while facing a bet', async () => {
  await table()
  const state = (await runtime.getRoom(players[0].bound.roomId))!
  const actor = players.findIndex((p) => p.bound.participantId === state.decision!.participantId)
  const p = state.participants[state.decision!.participantId]
  await command(actor, 'funds.cashOut', { amount: p.stack, source: 'stack' })
  const legal = views.get(players[actor].bound.controllerId)!.view.hand!.decision!.legal
  expect(legal.requiredToCall).toBeGreaterThan(0)
  expect(legal.canCheck).toBe(false)
  expect(legal.canCall).toBe(false)
  await vi.advanceTimersByTimeAsync(30000)
  const done = (await runtime.getRoom(state.roomId))!
  expect(done.phase).toBe('showing')
  expect(done.engine!.seats[p.seatId!]!.folded).toBe(true)
})

it('keeps a paused decision deadline frozen while chat and funding continue', async () => {
  await table()
  const roomId = players[0].bound.roomId
  await vi.advanceTimersByTimeAsync(5000)
  await command(0, 'room.pause')
  const remaining = (await runtime.getRoom(roomId))!.decision!.deadlineRemainingMs
  await vi.advanceTimersByTimeAsync(40000)
  await command(0, 'chat.send', { text: 'still paused' })
  await command(0, 'funds.buyIn', { amount: 100 })
  expect((await runtime.getRoom(roomId))!.paused).toBe(true)
  await command(0, 'room.resume')
  expect((await runtime.getRoom(roomId))!.decision!.deadlineRemainingMs).toBe(remaining)
})

it('locks an all-in participant and holds extra buy-in for the next hand', async () => {
  await table()
  let state = (await runtime.getRoom(players[0].bound.roomId))!
  const actor = players.findIndex((p) => p.bound.participantId === state.decision!.participantId)
  const d = views.get(players[actor].bound.controllerId)!.view.hand!.decision!
  await command(actor, 'hand.act', {
    handId: d.handId,
    decisionId: d.decisionId,
    legalRevision: d.legalRevision,
    action: 'raise',
    raiseTo: d.legal.maxRaiseTo
  })
  await command(actor, 'funds.buyIn', { amount: 500 })
  state = (await runtime.getRoom(state.roomId))!
  const p = state.participants[players[actor].bound.participantId]
  expect(p.pendingStack).toBe(500)
  expect(state.engine!.seats[p.seatId!]!.allIn).toBe(true)
  expect(state.engine!.seats[p.seatId!]!.stack).toBe(0)
})

it('runs out and settles immediately when both blinds exhaust their stacks', async () => {
  await table(2, 5)
  const state = (await runtime.getRoom(players[0].bound.roomId))!
  expect(state.phase).toBe('showing')
  expect(state.engine!.board).toHaveLength(5)
  expect(Object.values(state.participants).reduce((sum, p) => sum + p.stack, 0)).toBe(10)
})

it('reveals exactly one requested slot without counting the hand twice', async () => {
  await table()
  const before = (await runtime.getRoom(players[0].bound.roomId))!
  const actor = players.findIndex((p) => p.bound.participantId === before.decision!.participantId)
  const d = views.get(players[actor].bound.controllerId)!.view.hand!.decision!
  await command(actor, 'hand.act', {
    handId: d.handId,
    decisionId: d.decisionId,
    legalRevision: d.legalRevision,
    action: 'fold'
  })
  const net = (await runtime.getRoom(before.roomId))!.participants[players[actor].bound.participantId].settledNet
  await command(actor, 'hand.reveal', { handId: d.handId, slots: [1] })
  const opponent = views
    .get(players[1 - actor].bound.controllerId)!
    .view.participants.find((p) => p.participantId === players[actor].bound.participantId)!
  expect(opponent.hole?.map((slot) => slot.visibility)).toEqual(['hidden', 'known'])
  expect((await runtime.getRoom(before.roomId))!.participants[players[actor].bound.participantId].settledNet).toBe(net)
})

it('rolls back the room snapshot when receipt insertion fails in the same SQLite transaction', async () => {
  await table()
  const id = randomUUID()
  await command(0, 'funds.buyIn', { amount: 50 }, id)
  const before = (await store.load(players[0].bound.roomId))!.snapshot
  const receipt = await store.findCommand(before.roomId, players[0].bound.controllerId, id)
  const next = structuredClone(before)
  next.version++
  next.participants[players[0].bound.participantId].stack += 500
  await expect(store.commit({ nextState: next, receipt })).rejects.toThrow()
  expect((await store.load(before.roomId))!.snapshot).toEqual(before)
})

it('buffers an agent result during pause and applies it once after resuming', async () => {
  await table(1, 1000, false)
  const grant = await command(0, 'agent.grant', { providerParticipantId: players[0].bound.participantId, maxAgents: 9 })
  if (grant.kind !== 'ack' || !('grantId' in grant.ack.result)) throw new Error('missing AI grant')
  const credential = { controllerId: randomUUID(), resumeSecret: randomUUID() + randomUUID() }
  await command(0, 'agent.create', {
    grantId: grant.ack.result.grantId,
    credential,
    profile: { name: 'Agent', ini: 'A', hue: 200, templateId: 'test' }
  })
  players.push({ credential, bound: bound(await runtime.resume({ roomId: players[0].bound.roomId, credential })) })
  await command(1, 'funds.buyIn', { amount: 1000 })
  await command(1, 'seat.sit', { seatId: 1 })
  await command(0, 'room.start')
  const human = views.get(players[0].bound.controllerId)!.view.hand!.decision!
  await command(0, 'hand.act', {
    handId: human.handId,
    decisionId: human.decisionId,
    legalRevision: human.legalRevision,
    action: 'call'
  })
  const agent = views.get(players[1].bound.controllerId)!.view.hand!.decision!
  await command(0, 'room.pause')
  await command(1, 'hand.act', {
    handId: agent.handId,
    decisionId: agent.decisionId,
    legalRevision: agent.legalRevision,
    attemptId: agent.attemptId,
    action: 'check'
  })
  const paused = (await runtime.getRoom(players[0].bound.roomId))!
  expect(paused.engine!.board).toHaveLength(0)
  expect(paused.decision!.state).toBe('buffered')
  await command(0, 'room.resume')
  const resumed = (await runtime.getRoom(paused.roomId))!
  expect(resumed.engine!.board).toHaveLength(3)
  expect(resumed.decision!.decisionId).not.toBe(agent.decisionId)
})

it('lets a returning human take management after a paused host expires offline', async () => {
  await table()
  const roomId = players[0].bound.roomId
  await command(0, 'room.pause')
  await runtime.connectionClosed(roomId, players[0].bound.controllerId, players[0].bound.sessionGeneration)
  await vi.advanceTimersByTimeAsync(30000)
  await runtime.connectionClosed(roomId, players[1].bound.controllerId, players[1].bound.sessionGeneration)
  await vi.advanceTimersByTimeAsync(30000)
  expect((await runtime.getRoom(roomId))!.hostId).toBeNull()
  players[1].bound = bound(await runtime.resume({ roomId, credential: players[1].credential }))
  expect((await runtime.getRoom(roomId))!.hostId).toBe(players[1].bound.participantId)
  await command(1, 'room.resume')
  expect((await runtime.getRoom(roomId))!.paused).toBe(false)
})
