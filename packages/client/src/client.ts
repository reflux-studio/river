import {
  ArchivePageSchema,
  BoundCommandSchema,
  BootstrapCommandSchema,
  ProtocolOutputSchema,
  type Ack,
  type BootstrapCommand,
  type Bound,
  type BoundCommand,
  type CommandPayload,
  type CommandType,
  type Projection,
  type Effect,
  type PublicProfile,
  type RoomView
} from '@river/protocol'
import type { Transport } from './transport'

import type { KeyValueStore } from '@river/storage'
export type { KeyValueStore } from '@river/storage'
export interface ClientState {
  view: RoomView | null
  connected: boolean
  error: string | null
  effects: Effect[]
}
type Session = { roomId: string; controllerId: string; resumeSecret: string }

/** Owns a connection and its latest authorized view. Rendering subscribes to that view. */
export class RiverClient {
  private state: ClientState = { view: null, connected: false, error: null, effects: [] }
  private listeners = new Set<() => void>()
  private bound: Bound | null = null
  private session: Session | undefined
  private bootstrap: BootstrapCommand | undefined
  private commands = new Map<string, BoundCommand>()
  private waiting = new Map<
    string,
    { resolve(ack: Ack): void; reject(error: Error): void; cancel(): void }
  >()
  private binding: { resolve(): void; reject(error: Error): void } | null = null
  private stopped = false
  private replayPending = false
  private archiveAttempted = false
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private inbound: Promise<unknown> = Promise.resolve()
  private saving: Promise<unknown> = Promise.resolve()
  private historySync: Promise<void> | null = null

  constructor(
    readonly transport: Transport,
    readonly store: KeyValueStore,
    readonly serverUrl: string
  ) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private update(patch: Partial<ClientState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  async connect(): Promise<void> {
    this.stopped = false
    this.session = await this.store.get<Session>(`session:${this.serverUrl}`)
    this.bootstrap = await this.store.get<BootstrapCommand>(`bootstrap:${this.serverUrl}`)
    for (const command of (await this.store.get<BoundCommand[]>(`pending:${this.serverUrl}`)) ?? [])
      this.commands.set(command.commandId, command)
    if (!this.stopped) await this.open()
  }
  private async open(): Promise<void> {
    if (this.stopped) return
    await this.transport.open(
      (message) => {
        this.inbound = this.inbound
          .then(() => this.receive(message))
          .catch((error) => this.update({ error: String(error) }))
      },
      () => {
        this.bound = null
        this.update({ connected: false })
        if (!this.stopped)
          this.reconnectTimer = setTimeout(
            () => void this.open().catch((error) => this.update({ error: String(error) })),
            1000
          )
      }
    )
  }
  whenBound(): Promise<void> {
    if (this.bound && this.state.connected && this.state.view) return Promise.resolve()
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      let unsubscribe = () => {}
      const finish = () => {
        if (timer) clearTimeout(timer)
        unsubscribe()
      }
      unsubscribe = this.subscribe(() => {
        if (this.state.error) {
          finish()
          reject(new Error(this.state.error))
        } else if (this.bound && this.state.view && this.state.connected) {
          finish()
          resolve()
        }
      })
      timer = setTimeout(() => {
        finish()
        reject(new Error('timeout'))
      }, 8_000)
    })
  }
  async forgetRoom(): Promise<void> {
    await this.historySync
    if (this.state.view) await this.syncHistoryHead(this.state.view.self.historyHead)
    this.session = undefined
    this.bootstrap = undefined
    this.bound = null
    this.commands.clear()
    await this.store.set(`session:${this.serverUrl}`, null)
    await this.store.set(`bootstrap:${this.serverUrl}`, null)
    await this.saveCommands()
    this.update({ view: null, connected: false, error: null, effects: [] })
    this.transport.close()
    await this.open()
  }
  close(): void {
    this.stopped = true
    clearTimeout(this.reconnectTimer)
    this.transport.close()
    this.update({ connected: false })
  }

  async create(profile: PublicProfile, rules: CommandPayload<'room.rules'>['rules']): Promise<void> {
    return this.bind({
      kind: 'room.create',
      commandId: crypto.randomUUID(),
      credential: this.credential(),
      profile,
      rules
    })
  }
  async join(roomId: string, profile: PublicProfile): Promise<void> {
    const saved = await this.store.get<Session>(`credential:${this.serverUrl}:${roomId}`)
    return saved
      ? this.bind({ kind: 'session.resume', roomId, credential: saved })
      : this.bind({ kind: 'room.join', commandId: crypto.randomUUID(), roomId, credential: this.credential(), profile })
  }
  private credential() {
    return { controllerId: crypto.randomUUID(), resumeSecret: crypto.randomUUID() + crypto.randomUUID() }
  }
  private async bind(command: BootstrapCommand): Promise<void> {
    command = BootstrapCommandSchema.parse(command)
    this.bootstrap = command
    await this.store.set(`bootstrap:${this.serverUrl}`, command)
    const done = new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const binding = {
        resolve: () => {
          if (timer) clearTimeout(timer)
          resolve()
        },
        reject: (error: Error) => {
          if (timer) clearTimeout(timer)
          reject(error)
        }
      }
      this.binding = binding
      timer = setTimeout(() => {
        if (this.binding !== binding) return
        this.binding = null
        this.bootstrap = undefined
        void this.store.set(`bootstrap:${this.serverUrl}`, null)
        reject(new Error('timeout'))
      }, 8_000)
    })
    this.transport.send(command)
    return done
  }

  async command<T extends CommandType>(type: T, payload: CommandPayload<T>): Promise<Ack> {
    if (!this.bound) throw new Error('请先连接房间')
    const command: BoundCommand = BoundCommandSchema.parse({
      kind: 'command',
      protocol: 1,
      commandId: crypto.randomUUID(),
      roomId: this.bound.roomId,
      serverEpoch: this.bound.serverEpoch,
      type,
      payload
    })
    const readonly = type === 'state.sync' || type === 'archive.get'
    if (!readonly) {
      this.commands.set(command.commandId, command)
      await this.saveCommands()
    }
    const result = new Promise<Ack>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (action: () => void) => {
        if (timer) clearTimeout(timer)
        action()
      }
      this.waiting.set(command.commandId, {
        resolve: (ack) => finish(() => resolve(ack)),
        reject: (error) => finish(() => reject(error)),
        cancel: () => {
          if (timer) clearTimeout(timer)
        }
      })
      timer = setTimeout(() => {
        if (!this.waiting.has(command.commandId)) return
        this.waiting.delete(command.commandId)
        reject(new Error('timeout'))
      }, 10_000)
    })
    try {
      this.transport.send(command)
    } catch (error) {
      const inflight = this.waiting.get(command.commandId)
      this.waiting.delete(command.commandId)
      inflight?.cancel()
      throw error
    }
    return result
  }
  private saveCommands(): Promise<unknown> {
    const commands = [...this.commands.values()]
    const task = this.saving.then(() => this.store.set(`pending:${this.serverUrl}`, commands))
    this.saving = task.catch((error) => this.update({ error: `记录保存失败：${String(error)}` }))
    return task
  }

  private async receive(raw: unknown): Promise<void> {
    if (this.stopped) return
    const message = ProtocolOutputSchema.parse(raw)
    if (message.kind === 'welcome') {
      this.transport.send({ kind: 'hello', protocol: 1, clientVersion: '0.3.2', platform: 'web' })
      if (this.bootstrap) this.transport.send(this.bootstrap)
      else if (this.session)
        this.transport.send({ kind: 'session.resume', roomId: this.session.roomId, credential: this.session })
      else this.update({ connected: true, error: null })
    } else if (message.kind === 'bound') {
      this.bound = message
      this.replayPending = true
      this.archiveAttempted = false
      const credential = this.bootstrap && 'credential' in this.bootstrap ? this.bootstrap.credential : this.session
      if (!credential) throw new Error('缺少本地房间凭证')
      this.session = {
        roomId: message.roomId,
        controllerId: credential.controllerId,
        resumeSecret: credential.resumeSecret
      }
      await this.store.set(`session:${this.serverUrl}`, this.session)
      await this.store.set(`credential:${this.serverUrl}:${message.roomId}`, this.session)
      await this.store.set(`bootstrap:${this.serverUrl}`, null)
      this.bootstrap = undefined
      this.binding?.resolve()
      this.binding = null
    } else if (message.kind === 'projection') {
      if (message.controllerId !== this.bound?.controllerId) return
      this.update({ view: message.view, connected: true, error: null, effects: message.reset ? [] : message.effects })
      if (this.replayPending) {
        this.replayPending = false
        for (const command of this.commands.values()) this.transport.send(command)
      }
      if (!this.historySync && message.view.self.historyHead > 0) {
        this.historySync = this.syncHistory(message)
          .catch((error) => this.update({ error: `战绩保存失败：${String(error)}` }))
          .finally(() => {
            this.historySync = null
          })
      }
    } else if (message.kind === 'ack') {
      this.waiting.get(message.commandId)?.resolve(message)
      this.waiting.delete(message.commandId)
      if (this.commands.delete(message.commandId)) await this.saveCommands()
    } else if (message.kind === 'reject') {
      const error = new Error(message.detail ?? message.code)
      const resuming = this.bootstrap?.kind === 'session.resume' || (!this.bootstrap && !!this.session)
      if (
        !this.bound &&
        resuming &&
        !this.archiveAttempted &&
        ['ROOM_NOT_FOUND', 'ROOM_CLOSED'].includes(message.code)
      ) {
        this.archiveAttempted = true
        this.transport.send({ kind: 'archive.authenticate', roomId: this.session!.roomId, credential: this.session! })
        return
      }
      // 房间已删除或凭证失效：清掉本地会话，回到可建房/入房的大厅连接
      if (
        !this.bound &&
        resuming &&
        this.archiveAttempted &&
        ['ROOM_NOT_FOUND', 'ROOM_CLOSED', 'CONTROLLER_MISMATCH'].includes(message.code)
      ) {
        this.session = undefined
        this.bootstrap = undefined
        this.binding?.reject(error)
        this.binding = null
        await this.store.set(`session:${this.serverUrl}`, null)
        await this.store.set(`bootstrap:${this.serverUrl}`, null)
        this.update({ view: null, connected: true, error: null, effects: [] })
        return
      }
      this.update({ error: error.message })
      if (
        this.bootstrap &&
        'commandId' in this.bootstrap &&
        (!message.commandId || message.commandId === this.bootstrap.commandId)
      ) {
        this.binding?.reject(error)
        this.binding = null
        if (!message.retryable) {
          this.bootstrap = undefined
          await this.store.set(`bootstrap:${this.serverUrl}`, null)
        }
      }
      if (message.commandId) {
        this.waiting.get(message.commandId)?.reject(error)
        this.waiting.delete(message.commandId)
        if (message.code !== 'STORE_UNAVAILABLE' && this.commands.delete(message.commandId)) await this.saveCommands()
      } else {
        this.binding?.reject(error)
        this.binding = null
      }
    }
  }

  private syncHistory(projection: Projection): Promise<void> {
    return this.syncHistoryHead(projection.view.self.historyHead)
  }
  private async syncHistoryHead(head: number): Promise<void> {
    if (!this.bound) return
    const source = `${this.bound.roomId}:${this.bound.controllerId}`
    let cursor = (await this.store.get<number>(`cursor:${source}`)) ?? 0
    while (cursor < head) {
      const response = await this.command('archive.get', { afterRevision: cursor })
      const page = ArchivePageSchema.parse(response.result)
      for (const change of page.items) {
        const data = change.data
        const key =
          data.type === 'hand.upsert'
            ? `hand:${source}:${data.record.handId}`
            : data.type === 'funding'
              ? `funding:${data.entry.id}`
              : `summary:${source}`
        await this.store.set(
          key,
          data.type === 'hand.upsert' ? data.record : data.type === 'funding' ? data.entry : data.summary
        )
        cursor = change.revision
      }
      await this.store.set(`cursor:${source}`, cursor)
      head = Math.max(head, this.state.view?.self.historyHead ?? head)
    }
  }
}
