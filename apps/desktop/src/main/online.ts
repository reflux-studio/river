import { createClient } from '@libsql/client'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { BrowserWindow, IpcMain } from 'electron'
import { RoomRuntime, type RuntimeResult } from '@river/runtime'
import { SqliteRoomStore } from '@river/storage/sqlite'
import { ProtocolInputSchema, type Bound, type RoomView } from '@river/protocol'
import { RiverClient, webSocketTransport, type KeyValueStore, type Transport } from '@river/client'
import type { DesktopHost } from '@river/app/host'
import { personasCache, personaOf } from './db'
import { opponentAct, opponentTalk } from './agents/opponent'
import { coachSpeak, coachAsk, coachRecap } from './agents/coach'
import { modelReady } from './models/resolve'

export async function registerOnline(ipc: IpcMain, window: () => BrowserWindow | null, dataDir: string) {
  const data = createClient({ url: 'file:' + join(dataDir, 'player.db') })
  await data.execute('CREATE TABLE IF NOT EXISTS data (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  const store: KeyValueStore = {
    async get<T>(key: string) {
      const result = await data.execute({ sql: 'SELECT value FROM data WHERE key=?', args: [key] })
      return result.rows[0] ? (JSON.parse(String(result.rows[0].value)) as T) : undefined
    },
    async set(key, value) {
      await data.execute({
        sql: 'INSERT INTO data VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
        args: [key, JSON.stringify(value)]
      })
    },
    async entries<T>(prefix: string) {
      const result = await data.execute({
        sql: 'SELECT value FROM data WHERE key>=? AND key<? ORDER BY key',
        args: [prefix, prefix + '\uffff']
      })
      return result.rows.map((row) => JSON.parse(String(row.value)) as T)
    }
  }
  const database = createClient({ url: 'file:' + join(dataDir, 'rooms.db') })
  const rooms = new SqliteRoomStore(database)
  await rooms.initialize()
  const connections = new Set<{ bound: Bound | null; receive(message: unknown): void }>()
  const runtime = new RoomRuntime({
    store: rooms,
    clock: { now: Date.now, setTimeout, clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>) },
    random: { nextUint32: () => randomBytes(4).readUInt32BE() },
    id: randomUUID,
    hash: (value) => createHash('sha256').update(value).digest('hex'),
    serverEpoch: randomUUID(),
    deliver(projections) {
      for (const projection of projections)
        for (const connection of connections)
          if (
            connection.bound?.controllerId === projection.controllerId &&
            connection.bound.sessionGeneration === projection.sessionGeneration
          )
            connection.receive(projection)
    }
  })
  await runtime.restore()
  function localTransport(): Transport {
    const connection = { bound: null as Bound | null, receive: (_message: unknown) => {} }
    return {
      async open(receive) {
        connection.receive = receive
        connections.add(connection)
        receive({ kind: 'welcome', protocol: 1, connectionId: randomUUID(), serverAt: Date.now(), heartbeatMs: 10000 })
      },
      send(raw) {
        void (async () => {
          const message = ProtocolInputSchema.parse(raw)
          if (message.kind === 'hello') return
          let result: RuntimeResult
          if (message.kind === 'room.create') result = await runtime.createRoom(message)
          else if (message.kind === 'room.join') result = await runtime.joinRoom(message)
          else if (message.kind === 'session.resume') result = await runtime.resume(message)
          else if (message.kind === 'archive.authenticate') result = await runtime.authenticateArchive(message)
          else if (connection.bound)
            result = await runtime.submit(connection.bound.controllerId, message, connection.bound.sessionGeneration)
          else throw new Error('unbound local connection')
          if (result.kind === 'bound') {
            connection.bound = result.bound
            connection.receive(result.bound)
            connection.receive(result.projection)
          } else if (result.kind === 'ack') connection.receive(result.ack)
          else connection.receive(result.reject)
        })().catch((error) =>
          connection.receive({
            kind: 'reject',
            commandId: 'commandId' in raw ? raw.commandId : undefined,
            code: 'INVALID_PHASE',
            detail: String(error),
            retryable: false
          })
        )
      },
      close() {
        connections.delete(connection)
        if (connection.bound)
          void runtime
            .connectionClosed(
              connection.bound.roomId,
              connection.bound.controllerId,
              connection.bound.sessionGeneration
            )
            .catch(console.error)
      }
    }
  }
  let human: Transport | undefined
  ipc.handle('online.connect', async () => {
    human?.close()
    human = localTransport()
    await human.open(
      (message) => window()?.webContents.send('online.message', message),
      () => {}
    )
  })
  ipc.handle('online.send', (_event, message) => human?.send(message))
  ipc.handle('online.get', (_event, key: string) => store.get(key))
  ipc.handle('online.set', (_event, key: string, value: unknown) => store.set(key, value))
  ipc.handle('online.entries', (_event, prefix: string) => store.entries(prefix))
  ipc.handle('online.personas', () => personasCache.filter((p) => !p.deleted).map((p) => ({ id: p.id, name: p.name })))
  const agents = new Set<RiverClient>()
  ipc.handle('online.agent', async (_event, input: Parameters<DesktopHost['provideAgent']>[0]) => {
    if (!modelReady('opponent')) throw new Error('先在设置中配置对手模型')
    const persona = personaOf(input.templateId)
    if (!persona) throw new Error('角色不存在')
    const prefix = `agent:${input.credential.controllerId}:`
    const agentStore: KeyValueStore = {
      get: (key) => store.get(prefix + key),
      set: (key, value) => store.set(prefix + key, value),
      entries: (key) => store.entries(prefix + key)
    }
    await agentStore.set(`session:${input.url}`, { roomId: input.roomId, ...input.credential })
    const client = new RiverClient(
      input.url === 'local' ? localTransport() : webSocketTransport(input.url),
      agentStore,
      input.url
    )
    agents.add(client)
    let lastAttempt = ''
    let talkedHand = ''
    const abort = new AbortController()
    const stop = () => {
      unsubscribe()
      abort.abort()
      client.close()
      agents.delete(client)
    }
    const unsubscribe = client.subscribe(() => {
      const view = client.getSnapshot().view
      if (!view) return
      if (view.phase === 'closed') {
        stop()
        return
      }
      const self = view.participants.find((p) => p.participantId === view.self.participantId)
      if (self?.leaving) {
        stop()
        return
      }
      const decision = view.hand?.decision
      const key = decision ? `${decision.decisionId}:${decision.legalRevision}:${decision.attemptId}` : ''
      if (decision && !view.paused && view.hand?.turn?.state !== 'blocked' && key !== lastAttempt) {
        lastAttempt = key
        void (async () => {
          const result = await opponentAct(
            {
              name: persona.name,
              prompt: persona.prompt,
              memory: [],
              tag: { tableId: view.roomId, handNo: view.hand!.number },
              messages: [{ role: 'user', content: JSON.stringify(view) }]
            },
            abort.signal
          )
          const reference = {
            handId: decision.handId,
            decisionId: decision.decisionId,
            legalRevision: decision.legalRevision,
            attemptId: decision.attemptId
          }
          const current = client.getSnapshot().view?.hand?.decision
          if (
            current?.decisionId !== decision.decisionId ||
            current.legalRevision !== decision.legalRevision ||
            current.attemptId !== decision.attemptId
          )
            return
          if (!result.ok || !result.args) {
            await client.command('decision.failed', {
              ...reference,
              errorKind: 'provider',
              message: result.error ?? '模型未返回动作'
            })
            return
          }
          const legal = decision.legal
          let action = String(result.args.action ?? '').toLowerCase()
          if (action === 'bet' || action === 'allin' || action === 'all-in') action = 'raise'
          if (action === 'call' && legal.canCheck) action = 'check'
          if (action === 'fold' && !legal.canFold && legal.canCheck) action = 'check'
          if (!['fold', 'check', 'call', 'raise'].includes(action)) {
            await client.command('decision.failed', {
              ...reference,
              errorKind: 'invalidOutput',
              message: '模型返回了未知动作'
            })
            return
          }
          const to = Math.round(Number(result.args.to))
          const raiseTo =
            legal.minRaiseTo === null
              ? undefined
              : Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo!, Number.isFinite(to) ? to : legal.minRaiseTo))
          if (result.args.say) await client.command('chat.send', { text: result.args.say.slice(0, 500) })
          await client.command('hand.act', {
            ...reference,
            action: action as 'fold' | 'check' | 'call' | 'raise',
            ...(raiseTo !== undefined && action === 'raise' ? { raiseTo } : {})
          })
        })().catch((error) => {
          console.error('online agent action failed', error)
          const current = client.getSnapshot().view?.hand?.decision
          if (current?.decisionId === decision.decisionId && current.attemptId === decision.attemptId)
            void client
              .command('decision.failed', {
                handId: decision.handId,
                decisionId: decision.decisionId,
                legalRevision: decision.legalRevision,
                attemptId: decision.attemptId,
                errorKind: 'invalidOutput',
                message: String(error)
              })
              .catch(console.error)
        })
      }
      if (view.phase === 'showing' && view.hand && talkedHand !== view.hand.handId) {
        talkedHand = view.hand.handId
        void opponentTalk(
          {
            name: persona.name,
            prompt: persona.prompt,
            memory: [],
            tag: { tableId: view.roomId, handNo: view.hand.number },
            messages: [{ role: 'user', content: JSON.stringify(view) }]
          },
          abort.signal
        )
          .then(async (result) => {
            if (
              client.getSnapshot().view?.hand?.handId !== view.hand!.handId ||
              client.getSnapshot().view?.phase !== 'showing'
            )
              return
            if (result.args?.say) await client.command('chat.send', { text: result.args.say.slice(0, 500) })
            if (result.args?.showSlots?.length)
              await client.command('hand.reveal', { handId: view.hand!.handId, slots: result.args.showSlots })
          })
          .catch(console.error)
      }
    })
    try {
      await client.connect()
      await client.whenBound()
      await client.command('funds.buyIn', { amount: input.buyIn })
      const view = client.getSnapshot().view!
      const seatId = Array.from({ length: view.rules.capacity }, (_, i) => i).find(
        (i) => !view.participants.some((p) => p.seatId === i)
      )
      if (seatId === undefined) throw new Error('牌桌没有空位')
      await client.command('seat.sit', { seatId })
    } catch (error) {
      client.close()
      agents.delete(client)
      throw error
    }
  })
  ipc.handle('online.coach', async (_event, view: RoomView, question?: string) => {
    if (!view.rules.coachAllowed || !modelReady('coach')) throw new Error('本房未允许教练，或尚未配置教练模型')
    const input = {
      memory: [],
      tag: { tableId: view.roomId, handNo: view.hand?.number ?? 0 },
      messages: [{ role: 'user' as const, content: JSON.stringify(view) + (question ? `\nQuestion: ${question}` : '') }]
    }
    const signal = new AbortController().signal
    if (!question && view.phase === 'showing') {
      const result = await coachRecap(input, signal)
      if (!result.ok || !result.args) throw new Error(result.error ?? '复盘调用失败')
      return [result.args.headline, result.args.good, result.args.improve, result.args.tip].filter(Boolean).join('\n\n')
    }
    const result = question ? await coachAsk(input, () => {}, signal) : await coachSpeak(input, () => {}, signal)
    if (!result.ok) throw new Error(result.error ?? '教练调用失败')
    return result.text
  })
}
