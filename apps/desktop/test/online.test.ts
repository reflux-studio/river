import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IpcMain, BrowserWindow } from 'electron'
import type { RoomView } from '@river/protocol'
import { RiverClient, type KeyValueStore, type Transport } from '@river/client'

vi.mock('../src/main/db', () => ({
  personasCache: [{ id: 'test', name: 'Test AI', prompt: 'play poker' }],
  personaOf: () => ({ id: 'test', name: 'Test AI', prompt: 'play poker' })
}))
vi.mock('../src/main/models/resolve', () => ({ modelReady: () => true }))
vi.mock('../src/main/agents/opponent', () => ({
  opponentAct: vi.fn(async (input) => {
    const view = JSON.parse(input.messages[0].content) as RoomView
    return { ok: true, args: { action: view.hand!.decision!.legal.canCheck ? 'check' : 'call' } }
  }),
  opponentTalk: vi.fn(async () => ({ ok: true, args: { say: 'Good hand', showSlots: [0] } }))
}))
vi.mock('../src/main/agents/coach', () => ({
  coachSpeak: vi.fn(async () => ({ ok: true, text: 'Private coaching' })),
  coachAsk: vi.fn(async () => ({ ok: true, text: 'Question answered' })),
  coachRecap: vi.fn(async () => ({ ok: true, args: { headline: 'Private coaching', good: '', improve: '', tip: '' } }))
}))
import { registerOnline } from '../src/main/online'
let directory: string
let client: RiverClient
const handlers = new Map<string, (...args: any[]) => unknown>()
const listeners = new Set<(message: unknown) => void>()
const invoke = (channel: string, ...args: unknown[]) => Promise.resolve(handlers.get(channel)!(null, ...args))
afterEach(async () => {
  client?.close()
  await rm(directory, { recursive: true })
  listeners.clear()
  handlers.clear()
})

it('uses the shared runtime over IPC, runs an independent AI with existing model tools, and saves the hand', async () => {
  directory = await mkdtemp(join(tmpdir(), 'river-electron-online-'))
  const ipc = {
    handle(channel: string, handler: (...args: any[]) => unknown) {
      handlers.set(channel, handler)
    }
  } as unknown as IpcMain
  const window = {
    webContents: {
      send(_channel: string, message: unknown) {
        for (const listener of listeners) listener(message)
      }
    }
  } as unknown as BrowserWindow
  await registerOnline(ipc, () => window, directory)
  const store: KeyValueStore = {
    get: (key) => invoke('online.get', key) as any,
    set: (key, value) => invoke('online.set', key, value) as Promise<void>,
    entries: (key) => invoke('online.entries', key) as any
  }
  const transport: Transport = {
    async open(receive) {
      listeners.add(receive)
      await invoke('online.connect')
    },
    send(message) {
      void invoke('online.send', message)
    },
    close() {
      listeners.clear()
    }
  }
  client = new RiverClient(transport, store, 'local')
  await client.connect()
  await vi.waitFor(() => expect(client.getSnapshot().connected).toBe(true))
  await client.create(
    { profileId: crypto.randomUUID(), name: 'Human', ini: 'H', hue: 100, locale: 'zh' },
    {
      capacity: 10,
      smallBlind: 5,
      bigBlind: 10,
      defaultBuyIn: 1000,
      humanTurnMs: 30000,
      disconnectGraceMs: 60000,
      showingMs: 10000,
      coachAllowed: true,
      revealAllAfterHand: false,
      spectatorVision: true
    }
  )
  await client.whenBound()
  await client.command('funds.buyIn', { amount: 1000 })
  const view = client.getSnapshot().view!
  const grant = await client.command('agent.grant', { providerParticipantId: view.self.participantId, maxAgents: 9 })
  if (!('grantId' in grant.result)) throw new Error('grant missing')
  const credential = { controllerId: crypto.randomUUID(), resumeSecret: crypto.randomUUID() + crypto.randomUUID() }
  await client.command('agent.create', {
    grantId: grant.result.grantId,
    credential,
    profile: { name: 'Test AI', ini: 'T', hue: 200, templateId: 'test' }
  })
  await invoke('online.agent', { url: 'local', roomId: view.roomId, credential, templateId: 'test', buyIn: 1000 })
  await client.command('room.start', {})
  for (let i = 0; i < 20 && client.getSnapshot().view!.phase !== 'showing'; i++) {
    await vi.waitFor(() =>
      expect(
        !!client.getSnapshot().view!.hand?.decision || client.getSnapshot().view!.phase === 'showing',
        JSON.stringify(client.getSnapshot())
      ).toBe(true)
    )
    const current = client.getSnapshot().view!
    if (current.phase === 'showing') break
    const d = current.hand!.decision!
    await client.command('hand.act', {
      handId: d.handId,
      decisionId: d.decisionId,
      legalRevision: d.legalRevision,
      action: d.legal.canCheck ? 'check' : 'call'
    })
  }
  expect(client.getSnapshot().view!.phase).toBe('showing')
  expect(await invoke('online.coach', client.getSnapshot().view)).toBe('Private coaching')
  expect(await invoke('online.coach', client.getSnapshot().view, 'Why?')).toBe('Question answered')
  await vi.waitFor(async () => expect((await store.entries('hand:')).length).toBe(1))
  await client.command('room.close', {})
})
