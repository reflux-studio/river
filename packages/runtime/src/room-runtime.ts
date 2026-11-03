import { Table, type RandomInput } from '@river/engine'
import {
  BoundCommandSchema,
  ChipSchema,
  CommandPayloadSchemas,
  type Ack,
  type Bound,
  type BoundCommand,
  type CommandType,
  type Effect,
  type Projection,
  type PersonalChange,
  type PersonalHandRecord,
  type PersonalRoomSummary,
  type Reject
} from '@river/protocol'
import type {
  BootstrapReceipt,
  CommandReceipt,
  ControllerState,
  ParticipantState,
  RoomCommit,
  RoomRecord,
  RoomState,
  RoomStore,
  TimerState
} from '@river/storage/room'
import type { RoomRules } from '@river/storage/room'
import { projectRoom } from './projection'

export interface Clock {
  now(): number
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export interface RuntimeDependencies {
  store: RoomStore
  clock: Clock
  random: RandomInput
  id(): string
  hash(value: string): string
  serverEpoch: string
  deliver?(projections: Projection[]): void | Promise<void>
  log?(record: {
    roomId?: string
    controllerId?: string
    commandId?: string
    type?: string
    resultCode?: string
    elapsedMs: number
  }): void
}

export type RuntimeResult =
  | { kind: 'ack'; ack: Ack; projections: Projection[] }
  | { kind: 'reject'; reject: Reject }
  | { kind: 'bound'; bound: Bound; projection: Projection }

export class RuntimeFault extends Error {
  readonly code: Reject['code']
  readonly retryable: boolean

  constructor(code: Reject['code'], detail: string, retryable = false) {
    super(detail)
    this.name = 'RuntimeFault'
    this.code = code
    this.retryable = retryable
  }
}

/** Owns active rooms. Every mutation is serialized per room and committed before it is published. */
export class RoomRuntime {
  private readonly deps: RuntimeDependencies
  private readonly rooms = new Map<string, RoomActor>()
  private ready = false
  private readonly unavailable = new Set<string>()

  constructor(dependencies: RuntimeDependencies) {
    this.deps = dependencies
  }

  async restore(): Promise<void> {
    const records = await this.deps.store.loadActive()
    const candidates: Array<[RoomState, number]> = []
    for (const record of records) {
      try {
        if (
          record.snapshot.schemaVersion !== 1 ||
          record.snapshot.roomId !== record.roomId ||
          record.snapshot.version !== record.version ||
          record.snapshot.phase === 'closed'
        ) {
          throw new RuntimeFault('ROOM_UNAVAILABLE', `persisted room ${record.roomId} has an incompatible snapshot`)
        }
        if (record.snapshot.engine) Table.importState(record.snapshot.engine, this.deps.random)
        const recovered = structuredClone(record.snapshot)
        recovered.recovering = true
        for (const controller of Object.values(recovered.controllers)) {
          controller.generation += 1
          controller.online = false
          if (!recovered.participants[controller.participantId]?.exited) {
            controller.offlineRemainingMs = recovered.rules.disconnectGraceMs
            recovered.timers = recovered.timers.filter(
              (timer) => !(timer.kind === 'disconnectGrace' && timer.participantId === controller.participantId)
            )
            recovered.timers.push({
              timerId: this.deps.id(),
              generation: 1,
              kind: 'disconnectGrace',
              participantId: controller.participantId,
              remainingMs: recovered.rules.disconnectGraceMs
            })
          }
        }
        for (const timer of recovered.timers) timer.generation += 1
        candidates.push([recovered, record.version])
      } catch {
        this.unavailable.add(record.roomId)
      }
    }
    for (const [state, expectedVersion] of candidates) {
      const next = { ...state, version: expectedVersion + 1, recovering: true }
      await this.deps.store.commit({ nextState: next, receipt: null })
      this.rooms.set(next.roomId, new RoomActor(next, this.deps))
    }
    this.ready = true
  }

  isReady(): boolean {
    return this.ready
  }

  roomIds(): string[] {
    return [...this.rooms.entries()]
      .filter(([, actor]) => actor.stateSnapshot().phase !== 'closed')
      .map(([roomId]) => roomId)
  }

  async getRoom(roomId: string): Promise<RoomState | null> {
    const actor = await this.actorFor(roomId)
    return actor ? structuredClone(actor.stateSnapshot()) : null
  }

  private bootstrapQueue: Promise<unknown> = Promise.resolve()

  createRoom(input: Parameters<RoomRuntime['createRoomOnce']>[0]): Promise<RuntimeResult> {
    const next = this.bootstrapQueue.then(() => this.createRoomOnce(input))
    this.bootstrapQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async createRoomOnce(input: {
    commandId: string
    credential: { controllerId: string; resumeSecret: string }
    profile: { profileId: string; name: string; ini: string; hue: number; locale: 'zh' | 'en' }
    rules: RoomRules
  }): Promise<RuntimeResult> {
    if (!this.ready) throw new RuntimeFault('ROOM_UNAVAILABLE', 'room runtime is not ready', true)
    const secretHash = this.deps.hash(input.credential.resumeSecret)
    const payloadHash = this.deps.hash(
      canonicalize({ ...input, secretHash, credential: { controllerId: input.credential.controllerId } })
    )
    const previous = await this.deps.store.findBootstrap(input.credential.controllerId, input.commandId)
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        return reject(input.commandId, 'COMMAND_CONFLICT', 'bootstrap command id was reused with a different payload')
      const actor = await this.actorFor(previous.roomId)
      if (!actor) return reject(input.commandId, 'ROOM_UNAVAILABLE', 'created room is unavailable')
      return actor.bind(input.credential.controllerId, previous.result.participantId, previous.secretHash, false)
    }
    const roomId = this.deps.id()
    const participantId = this.deps.id()
    const now = this.deps.clock.now()
    const participant: ParticipantState = {
      participantId,
      profileId: input.profile.profileId,
      role: 'human',
      controllerId: input.credential.controllerId,
      joinOrder: 0,
      display: { name: input.profile.name, ini: input.profile.ini, hue: input.profile.hue },
      seatId: 0,
      nextHandSeatId: null,
      sitOut: false,
      nextHandSitOut: null,
      nextHandStand: false,
      stack: 0,
      pendingStack: 0,
      buyInTotal: 0,
      cashOutTotal: 0,
      settledNet: 0,
      abandonedContribution: 0,
      exited: false,
      ghostSeat: false
    }
    const controller: ControllerState = {
      controllerId: input.credential.controllerId,
      participantId,
      secretHash,
      generation: 1,
      role: 'human',
      online: true,
      offlineRemainingMs: null,
      providerGrantId: null
    }
    const state: RoomState = {
      schemaVersion: 1,
      roomId,
      version: 0,
      phase: 'waiting',
      rules: input.rules,
      rulesVersion: 1,
      hostId: participantId,
      createdAt: now,
      closedAt: null,
      closeReason: null,
      closeOutcome: null,
      participants: { [participantId]: participant },
      controllers: { [controller.controllerId]: controller },
      engine: null,
      currentHandId: null,
      handStartedAt: null,
      handSeatOwners: {},
      handVisibility: null,
      handViewerControllerIds: [],
      handNumber: 0,
      paused: false,
      recovering: false,
      started: false,
      waitingReason: 'notStarted',
      timers: [],
      decision: null,
      deferredRemovals: [],
      publicChat: [],
      historyHeads: { [controller.controllerId]: 0 },
      history: {},
      revealedSlots: {},
      showingRemainingMs: null,
      providers: {}
    }
    const receipt: BootstrapReceipt = {
      controllerId: input.credential.controllerId,
      commandId: input.commandId,
      payloadHash,
      secretHash,
      roomId,
      result: { roomId, participantId, controllerId: input.credential.controllerId },
      expiresAt: now + 7 * DAY
    }
    await this.deps.store.commit({ nextState: state, receipt: null, bootstrapReceipt: receipt })
    const actor = new RoomActor(state, this.deps)
    this.rooms.set(roomId, actor)
    return actor.bind(input.credential.controllerId, participantId, secretHash, true)
  }

  joinRoom(input: {
    commandId: string
    roomId: string
    credential: { controllerId: string; resumeSecret: string }
    profile: { profileId: string; name: string; ini: string; hue: number; locale: 'zh' | 'en' }
  }): Promise<RuntimeResult> {
    const next = this.bootstrapQueue.then(() => this.joinRoomOnce(input))
    this.bootstrapQueue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async joinRoomOnce(input: Parameters<RoomRuntime['joinRoom']>[0]): Promise<RuntimeResult> {
    if (!this.ready) throw new RuntimeFault('ROOM_UNAVAILABLE', 'room runtime is not ready', true)
    const secretHash = this.deps.hash(input.credential.resumeSecret)
    const payloadHash = this.deps.hash(
      canonicalize({ ...input, credential: { controllerId: input.credential.controllerId, secretHash } })
    )
    const previous = await this.deps.store.findBootstrap(input.credential.controllerId, input.commandId)
    if (previous) {
      if (previous.payloadHash !== payloadHash)
        return reject(input.commandId, 'COMMAND_CONFLICT', 'bootstrap command id was reused with a different payload')
      const actor = await this.actorFor(previous.roomId)
      if (!actor) return reject(input.commandId, 'ROOM_CLOSED', 'room is closed')
      return actor.bind(input.credential.controllerId, previous.result.participantId, previous.secretHash, false)
    }
    const actor = await this.actorFor(input.roomId)
    if (!actor) return reject(input.commandId, 'ROOM_NOT_FOUND', 'room does not exist')
    return actor.join(input, secretHash, payloadHash)
  }

  async resume(input: {
    roomId: string
    credential: { controllerId: string; resumeSecret: string }
  }): Promise<RuntimeResult> {
    const actor = await this.actorFor(input.roomId)
    if (!actor) return reject(this.deps.id(), 'ROOM_NOT_FOUND', 'room does not exist')
    return actor.resume(input.credential.controllerId, input.credential.resumeSecret)
  }

  async authenticateArchive(input: {
    roomId: string
    credential: { controllerId: string; resumeSecret: string }
  }): Promise<RuntimeResult> {
    const record = await this.deps.store.load(input.roomId)
    const controller = record?.snapshot.controllers[input.credential.controllerId]
    if (!record || !controller || controller.secretHash !== this.deps.hash(input.credential.resumeSecret))
      return reject(this.deps.id(), 'CONTROLLER_MISMATCH', 'room credential is invalid')
    const bound: Bound = {
      kind: 'bound',
      roomId: input.roomId,
      participantId: controller.participantId,
      controllerId: controller.controllerId,
      serverEpoch: this.deps.serverEpoch,
      sessionGeneration: controller.generation,
      historyHead: record.snapshot.historyHeads[controller.controllerId] ?? 0
    }
    const projection = projectRoom(record.snapshot, {
      controllerId: controller.controllerId,
      serverEpoch: this.deps.serverEpoch,
      sessionGeneration: controller.generation,
      viewSeq: 1,
      serverAt: this.deps.clock.now(),
      reset: true,
      turnDeadlineAt: null,
      random: this.deps.random
    })
    return { kind: 'bound', bound, projection }
  }

  async submit(controllerId: string, raw: unknown, generation: number): Promise<RuntimeResult> {
    let command: BoundCommand
    try {
      command = BoundCommandSchema.parse(raw)
    } catch {
      return reject(this.deps.id(), 'INVALID_PAYLOAD', 'invalid command envelope or payload')
    }
    const actor = await this.actorFor(command.roomId)
    if (!actor) {
      const closed = await this.deps.store.load(command.roomId)
      if (!closed) return reject(command.commandId, 'ROOM_NOT_FOUND', 'room does not exist')
      if (closed.phase !== 'closed') return reject(command.commandId, 'ROOM_UNAVAILABLE', 'room is unavailable', true)
      if (command.type === 'archive.get' && closed.snapshot.controllers[controllerId]?.generation === generation)
        return new RoomActor(closed.snapshot, this.deps).archiveResult(controllerId, command)
      const receipt = await this.deps.store.findCommand(command.roomId, controllerId, command.commandId)
      if (receipt) {
        const payloadHash = this.deps.hash(canonicalize({ type: command.type, payload: command.payload }))
        if (receipt.payloadHash !== payloadHash)
          return reject(command.commandId, 'COMMAND_CONFLICT', 'command id was reused with a different payload')
        if ('code' in receipt.result)
          return reject(
            command.commandId,
            receipt.result.code as Reject['code'],
            receipt.result.detail ?? '',
            receipt.result.retryable
          )
        return {
          kind: 'ack',
          ack: {
            kind: 'ack',
            commandId: command.commandId,
            roomVersion: receipt.roomVersion,
            historyHead: closed.snapshot.historyHeads?.[controllerId] ?? 0,
            result: receipt.result
          },
          projections: []
        }
      }
      return reject(command.commandId, 'ROOM_CLOSED', 'room is closed')
    }
    return actor.command(controllerId, command, generation)
  }

  async connectionClosed(roomId: string, controllerId: string, generation: number): Promise<void> {
    const actor = await this.actorFor(roomId)
    if (actor) await actor.connectionClosed(controllerId, generation)
  }

  async cleanupClosed(before: number): Promise<void> {
    await this.deps.store.cleanupClosed(before)
    for (const [roomId, actor] of this.rooms)
      if (actor.stateSnapshot().closedAt !== null && actor.stateSnapshot().closedAt! < before) this.rooms.delete(roomId)
  }

  private async actorFor(roomId: string): Promise<RoomActor | null> {
    if (this.unavailable.has(roomId)) throw new RuntimeFault('ROOM_UNAVAILABLE', 'room snapshot is quarantined')
    const cached = this.rooms.get(roomId)
    if (cached) return cached.stateSnapshot().phase === 'closed' ? null : cached
    const record = await this.deps.store.load(roomId)
    if (!record || record.phase === 'closed') return null
    const actor = new RoomActor(record.snapshot, this.deps)
    this.rooms.set(roomId, actor)
    return actor
  }
}

class RoomActor {
  private failed = false
  private state: RoomState
  private queue: Promise<unknown> = Promise.resolve()
  private viewSeq = new Map<string, number>()
  private timerHandles = new Map<string, unknown>()
  private turnDeadlineAt: number | null = null

  constructor(
    state: RoomState,
    private readonly deps: RuntimeDependencies
  ) {
    this.state = structuredClone(state)
    if (
      state.decision?.deadlineRemainingMs !== null &&
      state.decision?.deadlineRemainingMs !== undefined &&
      !state.paused &&
      !state.recovering
    ) {
      this.turnDeadlineAt = deps.clock.now() + state.decision.deadlineRemainingMs
    }
    this.rescheduleTimers()
  }

  stateSnapshot(): RoomState {
    return this.state
  }

  join(
    input: {
      commandId: string
      roomId: string
      credential: { controllerId: string; resumeSecret: string }
      profile: { profileId: string; name: string; ini: string; hue: number; locale: 'zh' | 'en' }
    },
    secretHash: string,
    payloadHash: string
  ): Promise<RuntimeResult> {
    return this.enqueue(async () => {
      if (this.state.phase === 'closed') return reject(input.commandId, 'ROOM_CLOSED', 'room is closed')
      if (this.state.controllers[input.credential.controllerId])
        return reject(input.commandId, 'COMMAND_CONFLICT', 'controller already belongs to this room')
      const candidate = structuredClone(this.state)
      const participantId = this.deps.id()
      const joinOrder = Math.max(-1, ...Object.values(candidate.participants).map((p) => p.joinOrder)) + 1
      candidate.participants[participantId] = {
        participantId,
        profileId: input.profile.profileId,
        role: 'human',
        controllerId: input.credential.controllerId,
        joinOrder,
        display: { name: input.profile.name, ini: input.profile.ini, hue: input.profile.hue },
        seatId: null,
        nextHandSeatId: null,
        sitOut: false,
        nextHandSitOut: null,
        nextHandStand: false,
        stack: 0,
        pendingStack: 0,
        buyInTotal: 0,
        cashOutTotal: 0,
        settledNet: 0,
        abandonedContribution: 0,
        exited: false,
        ghostSeat: false
      }
      candidate.controllers[input.credential.controllerId] = {
        controllerId: input.credential.controllerId,
        participantId,
        secretHash,
        generation: 1,
        role: 'human',
        online: true,
        offlineRemainingMs: null,
        providerGrantId: null
      }
      candidate.historyHeads[input.credential.controllerId] = 0
      if (!candidate.hostId) candidate.hostId = participantId
      if (candidate.currentHandId && candidate.phase !== 'waiting')
        candidate.handViewerControllerIds.push(input.credential.controllerId)
      const bootstrapReceipt: BootstrapReceipt = {
        controllerId: input.credential.controllerId,
        commandId: input.commandId,
        payloadHash,
        secretHash,
        roomId: input.roomId,
        result: { roomId: input.roomId, participantId, controllerId: input.credential.controllerId },
        expiresAt: this.deps.clock.now() + 7 * DAY
      }
      await this.commit(candidate, null, [], false, bootstrapReceipt)
      const bound: Bound = {
        kind: 'bound',
        roomId: input.roomId,
        participantId,
        controllerId: input.credential.controllerId,
        serverEpoch: this.deps.serverEpoch,
        sessionGeneration: 1,
        historyHead: 0
      }
      return { kind: 'bound', bound, projection: this.makeProjection(input.credential.controllerId, true) }
    })
  }

  bind(controllerId: string, participantId: string, secretHash: string, reset: boolean): Promise<RuntimeResult> {
    return this.enqueue(async () => {
      const candidate = structuredClone(this.state)
      const controller = candidate.controllers[controllerId]
      if (!controller || controller.participantId !== participantId || controller.secretHash !== secretHash)
        return reject(this.deps.id(), 'CONTROLLER_MISMATCH', 'room credential is invalid')
      controller.generation += reset ? 0 : 1
      controller.online = true
      controller.offlineRemainingMs = null
      if (controller.role === 'human') candidate.recovering = false
      candidate.timers = candidate.timers.filter(
        (timer) => !(timer.kind === 'disconnectGrace' && timer.participantId === participantId)
      )
      const committed = await this.commit(candidate, null, [], false)
      this.state = committed.state
      const bound: Bound = {
        kind: 'bound',
        roomId: this.state.roomId,
        participantId,
        controllerId,
        serverEpoch: this.deps.serverEpoch,
        sessionGeneration: controller.generation,
        historyHead: this.state.historyHeads[controllerId] ?? 0
      }
      const projection = this.makeProjection(controllerId, true)
      this.rescheduleTimers()
      return { kind: 'bound', bound, projection } as RuntimeResult
    })
  }

  resume(controllerId: string, resumeSecret: string): Promise<RuntimeResult> {
    return this.enqueue(async () => {
      const controller = this.state.controllers[controllerId]
      if (!controller || controller.secretHash !== this.deps.hash(resumeSecret))
        return reject(this.deps.id(), 'CONTROLLER_MISMATCH', 'room credential is invalid')
      const candidate = structuredClone(this.state)
      const resumed = candidate.controllers[controllerId]
      resumed.generation += 1
      if (candidate.participants[resumed.participantId].exited) {
        candidate.participants[resumed.participantId].exited = false
        candidate.participants[resumed.participantId].nextHandStand = true
      }
      resumed.online = true
      resumed.offlineRemainingMs = null
      if (resumed.role === 'human') candidate.recovering = false
      candidate.timers = candidate.timers.filter(
        (timer) => !(timer.kind === 'disconnectGrace' && timer.participantId === resumed.participantId)
      )
      if (!candidate.hostId)
        candidate.hostId =
          Object.values(candidate.participants)
            .filter((p) => p.role === 'human' && !p.exited && candidate.controllers[p.controllerId]?.online)
            .sort((a, b) => a.joinOrder - b.joinOrder)[0]?.participantId ?? null
      const effects: Effect[] = []
      if (candidate.phase === 'waiting')
        this.evaluateAutoStart(
          candidate,
          candidate.engine ? Table.importState(candidate.engine, this.deps.random) : null,
          effects
        )
      await this.commit(candidate, null, effects, false)
      const bound: Bound = {
        kind: 'bound',
        roomId: this.state.roomId,
        participantId: resumed.participantId,
        controllerId,
        serverEpoch: this.deps.serverEpoch,
        sessionGeneration: resumed.generation,
        historyHead: this.state.historyHeads[controllerId] ?? 0
      }
      const projection = this.makeProjection(controllerId, true)
      return { kind: 'bound', bound, projection }
    })
  }

  command(controllerId: string, command: BoundCommand, generation: number): Promise<RuntimeResult> {
    return this.enqueue(async () => {
      if (this.failed)
        return reject(command.commandId, 'STORE_UNAVAILABLE', 'room storage failed; restart the host', true)
      const startedAt = this.deps.clock.now()
      const controller = this.state.controllers[controllerId]
      if (!controller || !controller.online || controller.generation !== generation)
        return reject(command.commandId, 'UNBOUND', 'controller is not bound')
      if (command.type === 'archive.get') return this.archiveResult(controllerId, command)
      if (command.type === 'state.sync') {
        const projection = this.makeProjection(controllerId, true)
        await this.deps.deliver?.([projection])
        return {
          kind: 'ack',
          ack: {
            kind: 'ack',
            commandId: command.commandId,
            roomVersion: this.state.version,
            historyHead: this.state.historyHeads[controllerId] ?? 0,
            result: { status: 'applied' }
          },
          projections: [projection]
        }
      }
      const receipt = await this.deps.store.findCommand(this.state.roomId, controllerId, command.commandId)
      const payloadHash = this.deps.hash(canonicalize({ type: command.type, payload: command.payload }))
      if (receipt) {
        if (receipt.payloadHash !== payloadHash)
          return reject(command.commandId, 'COMMAND_CONFLICT', 'command id was reused with a different payload')
        return receipt.result && 'code' in receipt.result
          ? {
              kind: 'reject',
              reject: {
                kind: 'reject',
                commandId: command.commandId,
                code: receipt.result.code as Reject['code'],
                retryable: !!receipt.result.retryable,
                detail: receipt.result.detail
              }
            }
          : {
              kind: 'ack',
              ack: {
                kind: 'ack',
                commandId: command.commandId,
                roomVersion: receipt.roomVersion,
                historyHead: this.state.historyHeads[controllerId] ?? 0,
                result: receipt.result as Ack['result']
              },
              projections: []
            }
      }
      if (command.serverEpoch !== this.deps.serverEpoch)
        return reject(command.commandId, 'STALE_EPOCH', 'command belongs to an earlier server epoch')
      if (this.state.phase === 'closed') return reject(command.commandId, 'ROOM_CLOSED', 'room is closed')
      try {
        const parsedPayload = CommandPayloadSchemas[command.type].parse(command.payload) as Record<string, unknown>
        const candidate = structuredClone(this.state)
        const effects: Effect[] = []
        const result = this.applyCommand(candidate, controllerId, command, parsedPayload, effects)
        candidate.version += 1
        const ack: Ack = {
          kind: 'ack',
          commandId: command.commandId,
          roomVersion: candidate.version,
          historyHead: candidate.historyHeads[controllerId] ?? 0,
          result
        }
        const stored: CommandReceipt = {
          roomId: candidate.roomId,
          controllerId,
          commandId: command.commandId,
          payloadHash,
          roomVersion: candidate.version,
          result,
          createdAt: startedAt
        }
        this.captureRemaining(candidate)
        const prepared = this.prepareCommit(candidate, stored, effects, false)
        await this.persist(prepared.commit)
        this.updateDeadline(this.state, candidate)
        this.state = candidate
        this.acceptSequences(prepared.projections)
        this.rescheduleTimers()
        await Promise.resolve()
          .then(() => this.deps.deliver?.(prepared.projections))
          .catch(() => undefined)
        this.deps.log?.({
          roomId: command.roomId,
          controllerId,
          commandId: command.commandId,
          type: command.type,
          resultCode: 'OK',
          elapsedMs: this.deps.clock.now() - startedAt
        })
        return { kind: 'ack', ack, projections: prepared.projections }
      } catch (cause) {
        const error = asRuntimeFault(cause)
        this.deps.log?.({
          roomId: command.roomId,
          controllerId,
          commandId: command.commandId,
          type: command.type,
          resultCode: error.code,
          elapsedMs: this.deps.clock.now() - startedAt
        })
        return reject(command.commandId, error.code, error.message, error.retryable)
      }
    })
  }

  connectionClosed(controllerId: string, generation: number): Promise<void> {
    return this.enqueue(async () => {
      if (this.state.phase === 'closed') return
      const current = this.state.controllers[controllerId]
      if (!current || current.generation !== generation || !current.online) return
      const candidate = structuredClone(this.state)
      const controller = candidate.controllers[controllerId]
      controller.online = false
      controller.offlineRemainingMs = candidate.rules.disconnectGraceMs
      candidate.timers = candidate.timers.filter(
        (timer) => !(timer.kind === 'disconnectGrace' && timer.participantId === controller.participantId)
      )
      candidate.timers.push({
        timerId: this.deps.id(),
        generation: 1,
        kind: 'disconnectGrace',
        participantId: controller.participantId,
        remainingMs: candidate.rules.disconnectGraceMs
      })
      candidate.version += 1
      this.captureRemaining(candidate)
      const prepared = this.prepareCommit(
        candidate,
        null,
        [
          {
            id: this.deps.id(),
            type: 'participantChanged',
            at: this.deps.clock.now(),
            data: { participantId: controller.participantId, change: 'disconnected' }
          }
        ],
        false
      )
      await this.persist(prepared.commit)
      this.updateDeadline(this.state, candidate)
      this.state = candidate
      this.acceptSequences(prepared.projections)
      this.rescheduleTimers()
      await Promise.resolve()
        .then(() => this.deps.deliver?.(prepared.projections))
        .catch(() => undefined)
    })
  }

  private applyCommand(
    state: RoomState,
    controllerId: string,
    command: BoundCommand,
    payload: Record<string, unknown>,
    effects: Effect[]
  ): Ack['result'] {
    if (
      state.paused &&
      ![
        'room.resume',
        'room.pause',
        'room.close',
        'room.leave',
        'funds.buyIn',
        'funds.cashOut',
        'chat.send',
        'state.sync',
        'host.transfer',
        'participant.remove',
        'archive.get',
        'hand.act',
        'decision.failed',
        'decision.retry'
      ].includes(command.type)
    ) {
      throw new RuntimeFault('INVALID_PHASE', 'room is paused')
    }
    const controller = state.controllers[controllerId]
    if (
      state.recovering &&
      !['state.sync', 'chat.send', 'room.close', 'room.leave', 'funds.buyIn', 'funds.cashOut'].includes(command.type)
    )
      throw new RuntimeFault('INVALID_PHASE', 'room is waiting for human recovery')
    const participant = state.participants[controller.participantId]
    const host = state.hostId === participant.participantId
    const table = state.engine ? Table.importState(state.engine, this.deps.random) : null
    const requireHost = () => {
      if (!host) throw new RuntimeFault('NOT_HOST', 'only the room host may do this')
    }
    const requirePlaying = () => {
      if (!table) throw new RuntimeFault('INVALID_PHASE', 'there is no active hand')
    }
    const simpleResult = (status: 'applied' | 'scheduled' | 'buffered' = 'applied'): Ack['result'] => ({ status })

    switch (command.type as CommandType) {
      case 'room.start': {
        requireHost()
        if (state.started || state.phase === 'closed')
          throw new RuntimeFault('INVALID_PHASE', 'room has already started or closed')
        if (
          Object.values(state.participants).filter(
            (p) => p.seatId !== null && p.stack > 0 && !p.exited && !p.sitOut && !p.ghostSeat && !p.nextHandStand
          ).length < 2
        )
          throw new RuntimeFault('INSUFFICIENT_CHIPS', 'at least two seated funded participants are required')
        const game = new Table(
          { smallBlind: state.rules.smallBlind, bigBlind: state.rules.bigBlind },
          state.rules.capacity,
          this.deps.random
        )
        for (const p of Object.values(state.participants))
          if (p.seatId !== null && p.stack > 0 && !p.exited && !p.sitOut && !p.ghostSeat && !p.nextHandStand)
            game.sitDown(p.seatId, p.stack)
        game.startHand()
        this.syncStacks(state, game)
        state.engine = game.exportState()
        state.started = true
        state.phase = 'playing'
        state.waitingReason = null
        state.handNumber = game.handNumber()
        state.currentHandId = this.deps.id()
        state.handStartedAt = this.deps.clock.now()
        state.handSeatOwners = Object.fromEntries(
          Object.values(state.participants)
            .filter(
              (p) =>
                p.seatId !== null &&
                !p.exited &&
                !p.sitOut &&
                !p.ghostSeat &&
                !p.nextHandStand &&
                !!game.holeCards()[p.seatId]
            )
            .map((p) => [p.seatId!, p.participantId])
        )
        state.handVisibility = {
          spectatorVision: state.rules.spectatorVision,
          revealAllAfterHand: state.rules.revealAllAfterHand
        }
        state.handViewerControllerIds = Object.keys(state.controllers)
        this.createDecision(state, game)
        effects.push(...dealEffects(this.deps.id, state.currentHandId, game, this.deps.clock.now()))
        if (!game.isBettingRoundInProgress()) this.advanceHand(state, game, effects)
        return simpleResult()
      }
      case 'room.rules': {
        requireHost()
        if (state.engine && state.phase !== 'waiting')
          throw new RuntimeFault('INVALID_PHASE', 'room rules can only change between hands')
        const nextRules = payload.rules as RoomState['rules']
        if (
          state.engine &&
          nextRules.capacity < state.rules.capacity &&
          Object.values(state.participants).some(
            (p) =>
              (p.seatId !== null && p.seatId >= nextRules.capacity) ||
              (p.nextHandSeatId !== null && p.nextHandSeatId >= nextRules.capacity)
          )
        ) {
          throw new RuntimeFault('INVALID_PAYLOAD', 'cannot reduce capacity below an occupied or reserved seat')
        }
        state.rules = nextRules
        state.rulesVersion += 1
        return simpleResult()
      }
      case 'seat.sit': {
        if (participant.role === 'agent' && !controller.providerGrantId && !host)
          throw new RuntimeFault('NOT_GRANTED', 'agent seating is not authorized')
        const seatId = payload.seatId as number
        if (seatId >= state.rules.capacity) throw new RuntimeFault('SEAT_UNAVAILABLE', 'seat exceeds room capacity')
        if (participant.seatId !== null && participant.seatId !== seatId)
          throw new RuntimeFault('SEAT_UNAVAILABLE', 'stand before choosing another seat')
        if (
          Object.values(state.participants).some(
            (p) => p.participantId !== participant.participantId && (p.seatId === seatId || p.nextHandSeatId === seatId)
          )
        )
          throw new RuntimeFault('SEAT_UNAVAILABLE', 'seat is occupied or reserved')
        if (state.phase === 'playing' || state.phase === 'showing') {
          participant.nextHandSeatId = seatId
          participant.nextHandSitOut = false
          return simpleResult('scheduled')
        }
        participant.seatId = seatId
        participant.nextHandSeatId = null
        participant.nextHandStand = false
        participant.exited = false
        effects.push(changeEffect(this.deps.id(), this.deps.clock.now(), participant.participantId, 'seated'))
        this.evaluateAutoStart(state, undefined, effects)
        return simpleResult()
      }
      case 'seat.stand': {
        const when = payload.when as 'now' | 'nextHand'
        if (state.phase === 'waiting' && when === 'now') {
          participant.seatId = null
          participant.nextHandSeatId = null
          participant.nextHandStand = false
          this.evaluateAutoStart(state, table, effects)
          return simpleResult()
        }
        if (when === 'nextHand' || state.phase === 'showing') {
          participant.nextHandStand = true
          return simpleResult('scheduled')
        }
        participant.nextHandStand = true
        if (
          participant.seatId !== null &&
          table &&
          !table.seats()[participant.seatId]?.allIn &&
          !table.seats()[participant.seatId]?.folded
        ) {
          if (table.forceFold(participant.seatId)) {
            this.syncStacks(state, table)
            this.advanceHand(state, table, effects)
          }
          participant.ghostSeat = false
        } else if (participant.seatId !== null && table && table.seats()[participant.seatId]?.allIn) {
          participant.ghostSeat = true
        }
        if (table) state.engine = table.exportState()
        return simpleResult('scheduled')
      }
      case 'seat.sitOut': {
        participant.nextHandSitOut = payload.enabled as boolean
        if (state.phase === 'waiting') {
          participant.sitOut = payload.enabled as boolean
          participant.nextHandSitOut = null
          this.evaluateAutoStart(state, table, effects)
        }
        return simpleResult('scheduled')
      }
      case 'room.leave': {
        if (participant.role === 'agent')
          throw new RuntimeFault('NOT_GRANTED', 'agent controllers use disconnect/remove lifecycle')
        if (state.paused && state.phase === 'playing') {
          participant.exited = true
          const remainingHumans = Object.values(state.participants).filter((p) => p.role === 'human' && !p.exited)
          if (remainingHumans.length === 0) this.closeState(state, 'lastHumanLeft')
          else {
            if (!state.deferredRemovals.includes(participant.participantId))
              state.deferredRemovals.push(participant.participantId)
            if (state.hostId === participant.participantId)
              state.hostId =
                remainingHumans
                  .filter((p) => state.controllers[p.controllerId]?.online)
                  .sort((a, b) => a.joinOrder - b.joinOrder)[0]?.participantId ?? null
          }
        } else {
          this.removeParticipant(state, participant.participantId, table, effects)
        }
        return simpleResult()
      }
      case 'funds.buyIn': {
        const amount = payload.amount as number
        ChipSchema.parse(
          safeAdd(
            state.phase === 'playing' &&
              (participant.ghostSeat ||
                (participant.seatId !== null && table?.seats()[participant.seatId]?.allIn) ||
                participant.seatId === null)
              ? participant.pendingStack
              : participant.stack,
            amount
          )
        )
        const currentEngineSeat = participant.seatId === null ? null : table?.seats()[participant.seatId]
        const pending =
          state.phase === 'playing' &&
          (participant.ghostSeat || currentEngineSeat?.allIn || participant.seatId === null)
        if (pending) participant.pendingStack = safeAdd(participant.pendingStack, amount)
        else {
          participant.stack = safeAdd(participant.stack, amount)
          if (table && participant.seatId !== null) {
            if (state.phase === 'playing') table.adjustStack(participant.seatId, amount)
          }
        }
        participant.buyInTotal = safeAdd(participant.buyInTotal, amount)
        const funding = {
          id: this.deps.id(),
          roomId: state.roomId,
          participantId: participant.participantId,
          handId: state.phase === 'playing' ? state.currentHandId : null,
          commandId: command.commandId,
          direction: 'buyIn' as const,
          amount,
          sourceOrDestination: pending ? ('pending' as const) : ('stack' as const),
          affectsCurrentHand: !pending && state.phase === 'playing',
          at: this.deps.clock.now()
        }
        this.recordChange(state, participant.controllerId, { type: 'funding', entry: funding })
        if (table) state.engine = table.exportState()
        effects.push({
          id: this.deps.id(),
          type: 'fundsChanged',
          at: this.deps.clock.now(),
          data: {
            participantId: participant.participantId,
            direction: 'buyIn',
            amount,
            destination: pending ? 'pending' : 'stack'
          }
        })
        this.fundingChanged(state, effects)
        return { status: 'applied', fundingId: funding.id, amount, destination: pending ? 'pending' : 'stack' }
      }
      case 'funds.cashOut': {
        const amount = payload.amount as number
        const source = payload.source as 'stack' | 'pending'
        const available = source === 'stack' ? participant.stack : participant.pendingStack
        if (amount > available) throw new RuntimeFault('INSUFFICIENT_CHIPS', 'cash out exceeds available chips')
        if (source === 'stack') {
          if (participant.seatId !== null && table) {
            if (state.phase === 'playing') table.adjustStack(participant.seatId, -amount)
          }
          participant.stack -= amount
        } else participant.pendingStack -= amount
        participant.cashOutTotal = safeAdd(participant.cashOutTotal, amount)
        const pending = source === 'pending'
        const funding = {
          id: this.deps.id(),
          roomId: state.roomId,
          participantId: participant.participantId,
          handId: state.phase === 'playing' ? state.currentHandId : null,
          commandId: command.commandId,
          direction: 'cashOut' as const,
          amount,
          sourceOrDestination: source,
          affectsCurrentHand: source === 'stack' && state.phase === 'playing',
          at: this.deps.clock.now()
        }
        this.recordChange(state, participant.controllerId, { type: 'funding', entry: funding })
        if (table) state.engine = table.exportState()
        effects.push({
          id: this.deps.id(),
          type: 'fundsChanged',
          at: this.deps.clock.now(),
          data: { participantId: participant.participantId, direction: 'cashOut', amount, destination: source }
        })
        this.fundingChanged(state, effects)
        return { status: 'applied', fundingId: funding.id, amount, destination: source }
      }
      case 'hand.act': {
        requirePlaying()
        const ref = payload as unknown as {
          handId: string
          decisionId: string
          legalRevision: number
          attemptId?: string
          action: 'fold' | 'check' | 'call' | 'raise'
          raiseTo?: number
        }
        if (
          !state.decision ||
          state.decision.handId !== ref.handId ||
          state.decision.decisionId !== ref.decisionId ||
          state.decision.legalRevision !== ref.legalRevision ||
          (state.decision.attemptId && state.decision.attemptId !== ref.attemptId)
        )
          throw new RuntimeFault('STALE_DECISION', 'decision reference is stale')
        if (state.decision.participantId !== participant.participantId)
          throw new RuntimeFault('ILLEGAL_ACTION', 'controller does not own the acting seat')
        if (state.decision?.state === 'blocked')
          throw new RuntimeFault('INVALID_PHASE', 'agent decision is waiting for retry')
        if (state.paused) {
          if (participant.role !== 'agent') throw new RuntimeFault('INVALID_PHASE', 'room is paused')
          state.decision.bufferedCandidate = {
            action: ref.action,
            ...(ref.raiseTo === undefined ? {} : { raiseTo: ref.raiseTo })
          }
          state.decision.state = 'buffered'
          return simpleResult('buffered')
        }
        this.checkDeadline(state)
        const legal = table!.legalActions()
        const action = ref.action === 'raise' && table!.currentBet() === 0 ? 'bet' : ref.action
        if (action === 'raise' || action === 'bet') table!.actionTaken(action, ref.raiseTo)
        else table!.actionTaken(action)
        effects.push({
          id: this.deps.id(),
          type: 'actionApplied',
          handId: state.currentHandId!,
          at: this.deps.clock.now(),
          data: {
            seatId: participant.seatId!,
            action: ref.action,
            paidDelta: table!.seats()[participant.seatId!]!.bet - (state.engine?.seats[participant.seatId!]?.bet ?? 0),
            ...(ref.raiseTo === undefined ? {} : { raiseTo: ref.raiseTo })
          }
        })
        this.syncStacks(state, table!)
        state.engine = table!.exportState()
        state.decision = null
        this.advanceHand(state, table!, effects)
        return simpleResult()
      }
      case 'hand.reveal': {
        if (state.phase !== 'showing' || payload.handId !== state.currentHandId)
          throw new RuntimeFault('INVALID_PHASE', 'cards can only be shown during this hand’s showing period')
        const slots = payload.slots as Array<0 | 1>
        if (new Set(slots).size !== slots.length) throw new RuntimeFault('INVALID_PAYLOAD', 'duplicate card slot')
        if (
          participant.seatId === null ||
          !table ||
          state.handSeatOwners[participant.seatId] !== participant.participantId
        )
          throw new RuntimeFault('INVALID_PHASE', 'participant has no hand to reveal')
        const cards = table.holeCards()[participant.seatId]
        if (!cards || cards.length !== 2)
          throw new RuntimeFault('INVALID_PHASE', 'participant has no cards in this hand')
        const shown = state.revealedSlots[participant.participantId] ?? []
        state.revealedSlots[participant.participantId] = [...new Set([...shown, ...slots])].sort() as Array<0 | 1>
        this.recordHand(state, table, true)
        effects.push({
          id: this.deps.id(),
          type: 'holeRevealed',
          handId: state.currentHandId!,
          at: this.deps.clock.now(),
          data: { participantId: participant.participantId, slots: slots.map((slot) => ({ slot, card: cards[slot] })) }
        })
        return simpleResult()
      }
      case 'hand.skipShowing': {
        requireHost()
        if (state.phase !== 'showing' || payload.handId !== state.currentHandId)
          throw new RuntimeFault('INVALID_PHASE', 'there is no matching showing period to skip')
        state.showingRemainingMs = 0
        this.finishShowing(state, table, effects)
        return simpleResult()
      }
      case 'room.pause': {
        requireHost()
        if (state.paused) return simpleResult()
        state.paused = true
        if (state.decision?.deadlineRemainingMs !== null && state.decision)
          state.decision.deadlineRemainingMs = Math.max(
            0,
            (this.turnDeadlineAt ?? this.deps.clock.now()) - this.deps.clock.now()
          )
        for (const timer of state.timers)
          if (timer.kind === 'showing' && this.timerHandles.has(timer.timerId)) {
            timer.remainingMs = Math.max(0, this.timerDueAt(timer.timerId) - this.deps.clock.now())
            state.showingRemainingMs = timer.remainingMs
          }
        state.timers = state.timers.filter((timer) => timer.kind === 'disconnectGrace' || timer.kind === 'showing')
        effects.push({ id: this.deps.id(), type: 'roomPaused', at: this.deps.clock.now(), data: { paused: true } })
        return simpleResult()
      }
      case 'room.resume': {
        requireHost()
        if (!state.paused) return simpleResult()
        state.paused = false
        for (const participantId of state.deferredRemovals.splice(0))
          this.removeParticipant(state, participantId, table, effects)
        if (state.phase === 'closed') return simpleResult()
        if (state.decision?.bufferedCandidate && table) {
          const candidate = state.decision.bufferedCandidate
          const action = candidate.action === 'raise' && table.currentBet() === 0 ? 'bet' : candidate.action
          const legal = table.legalActions()
          const valid =
            legal.actions.includes(action) &&
            (!(action === 'bet' || action === 'raise') ||
              (candidate.raiseTo !== undefined &&
                candidate.raiseTo >= legal.chipRange!.min &&
                candidate.raiseTo <= legal.chipRange!.max))
          state.decision.bufferedCandidate = null
          state.decision.state = 'ready'
          if (valid) {
            table.actionTaken(action, candidate.raiseTo)
            this.syncStacks(state, table)
            state.engine = table.exportState()
            state.decision = null
            this.advanceHand(state, table, effects)
          } else state.decision.attemptId = this.deps.id()
        }
        if (state.phase === 'waiting')
          this.evaluateAutoStart(
            state,
            state.engine ? Table.importState(state.engine, this.deps.random) : null,
            effects
          )
        if (state.decision?.deadlineRemainingMs !== null && state.decision) {
          if (state.participants[state.decision.participantId]?.role === 'human')
            state.timers.push({
              timerId: this.deps.id(),
              generation: 1,
              kind: 'humanTurn',
              participantId: state.decision.participantId,
              remainingMs: state.decision.deadlineRemainingMs
            })
        }
        effects.push({ id: this.deps.id(), type: 'roomPaused', at: this.deps.clock.now(), data: { paused: false } })
        return simpleResult()
      }
      case 'room.close': {
        requireHost()
        this.closeState(state, 'hostClosed')
        effects.push({
          id: this.deps.id(),
          type: 'roomClosed',
          at: this.deps.clock.now(),
          data: { reason: 'hostClosed' }
        })
        return simpleResult()
      }
      case 'participant.remove': {
        requireHost()
        const target = payload.targetParticipantId as string
        if (!state.participants[target]) throw new RuntimeFault('INVALID_PAYLOAD', 'participant does not exist')
        if (state.paused && state.phase === 'playing') {
          if (!state.deferredRemovals.includes(target)) state.deferredRemovals.push(target)
          if (
            state.participants[target].role === 'human' &&
            !Object.values(state.participants).some(
              (p) =>
                p.role === 'human' &&
                !p.exited &&
                p.participantId !== target &&
                !state.deferredRemovals.includes(p.participantId)
            )
          ) {
            state.participants[target].exited = true
            this.closeState(state, 'lastHumanLeft')
          }
        } else this.removeParticipant(state, target, table, effects)
        return simpleResult(state.paused ? 'scheduled' : 'applied')
      }
      case 'host.transfer': {
        requireHost()
        const target = payload.targetParticipantId as string
        const next = state.participants[target]
        if (!next || next.role !== 'human' || !state.controllers[next.controllerId]?.online || next.exited)
          throw new RuntimeFault('INVALID_PHASE', 'new host must be an online human room member')
        state.hostId = target
        effects.push(changeEffect(this.deps.id(), this.deps.clock.now(), target, 'hostTransferred'))
        return simpleResult()
      }
      case 'chat.send': {
        if (participant.exited) throw new RuntimeFault('UNBOUND', 'participant has left the room')
        const text = payload.text as string
        if (
          state.publicChat.filter(
            (m) => m.senderParticipantId === participant.participantId && m.serverAt > this.deps.clock.now() - 5000
          ).length >= 5
        )
          throw new RuntimeFault('RATE_LIMITED', 'chat rate exceeded', true)
        const message = {
          messageId: this.deps.id(),
          senderParticipantId: participant.participantId,
          senderRole: participant.role,
          senderName: participant.display.name,
          text,
          serverAt: this.deps.clock.now()
        }
        state.publicChat = [...state.publicChat, message].slice(-100)
        effects.push({ id: this.deps.id(), type: 'chatAdded', at: this.deps.clock.now(), data: message })
        return simpleResult()
      }
      case 'state.sync':
        return simpleResult()
      case 'decision.failed': {
        const ref = payload as { decisionId: string; attemptId?: string }
        if (
          !state.decision ||
          state.decision.participantId !== participant.participantId ||
          state.decision.decisionId !== ref.decisionId ||
          state.decision.attemptId !== ref.attemptId
        )
          throw new RuntimeFault('STALE_DECISION', 'agent attempt is stale')
        state.decision.state = 'blocked'
        return simpleResult()
      }
      case 'decision.retry': {
        requireHost()
        if (!state.decision || state.decision.decisionId !== payload.decisionId || state.decision.state !== 'blocked')
          throw new RuntimeFault('STALE_DECISION', 'there is no failed agent decision')
        state.decision.attemptId = this.deps.id()
        state.decision.state = 'ready'
        return simpleResult()
      }
      case 'agent.grant': {
        requireHost()
        const target = state.participants[payload.providerParticipantId as string]
        if (!target || target.role !== 'human' || target.exited)
          throw new RuntimeFault('NOT_GRANTED', 'provider must be a room member')
        const grant = { grantId: this.deps.id(), maxAgents: payload.maxAgents as number }
        state.providers[target.participantId] = grant
        return { status: 'applied', ...grant, providerParticipantId: target.participantId }
      }
      case 'agent.create': {
        const grant = state.providers[participant.participantId]
        if (!grant || grant.grantId !== payload.grantId)
          throw new RuntimeFault('NOT_GRANTED', 'AI provider is not authorized')
        if (
          Object.values(state.controllers).filter(
            (c) => c.providerGrantId === grant.grantId && !state.participants[c.participantId].exited
          ).length >= grant.maxAgents
        )
          throw new RuntimeFault('ROOM_FULL', 'AI grant limit reached')
        const credential = payload.credential as { controllerId: string; resumeSecret: string }
        if (state.controllers[credential.controllerId])
          throw new RuntimeFault('COMMAND_CONFLICT', 'controller already exists')
        const profile = payload.profile as { name: string; ini: string; hue: number }
        const participantId = this.deps.id()
        state.participants[participantId] = {
          participantId,
          profileId: null,
          role: 'agent',
          controllerId: credential.controllerId,
          joinOrder: Math.max(...Object.values(state.participants).map((p) => p.joinOrder)) + 1,
          display: profile,
          seatId: null,
          nextHandSeatId: null,
          sitOut: false,
          nextHandSitOut: null,
          nextHandStand: false,
          stack: 0,
          pendingStack: 0,
          buyInTotal: 0,
          cashOutTotal: 0,
          settledNet: 0,
          abandonedContribution: 0,
          exited: false,
          ghostSeat: false
        }
        state.controllers[credential.controllerId] = {
          controllerId: credential.controllerId,
          participantId,
          secretHash: this.deps.hash(credential.resumeSecret),
          generation: 1,
          role: 'agent',
          online: false,
          offlineRemainingMs: state.rules.disconnectGraceMs,
          providerGrantId: grant.grantId
        }
        state.timers.push({
          timerId: this.deps.id(),
          generation: 1,
          kind: 'disconnectGrace',
          participantId,
          remainingMs: state.rules.disconnectGraceMs
        })
        state.historyHeads[credential.controllerId] = 0
        return { status: 'applied', participantId, controllerId: credential.controllerId }
      }
      case 'archive.get':
        throw new RuntimeFault('INVALID_PHASE', 'archive.get is served by the bound archive endpoint')
      default:
        throw new RuntimeFault('INVALID_PAYLOAD', `unsupported command ${command.type}`)
    }
  }

  private fundingChanged(state: RoomState, effects: Effect[]): void {
    if (state.decision) {
      state.decision.legalRevision += 1
      state.decision.bufferedCandidate = null
      state.decision.attemptId =
        state.participants[state.decision.participantId]?.role === 'agent' ? this.deps.id() : null
    }
    if (state.phase === 'waiting')
      this.evaluateAutoStart(state, state.engine ? Table.importState(state.engine, this.deps.random) : null, effects)
  }

  private advanceHand(state: RoomState, table: Table, effects: Effect[]): void {
    while (!table.areBettingRoundsCompleted()) {
      while (table.isBettingRoundInProgress()) {
        const actingSeat = table.playerToAct()
        const actingParticipant = Object.values(state.participants).find((p) => p.seatId === actingSeat)
        // 已离座或下手暂离的座位按管理性弃牌处理，保留已投入的筹码
        if (!actingParticipant?.exited && !actingParticipant?.nextHandStand) break
        table.actionTaken(table.legalActions().actions.includes('fold') ? 'fold' : 'check')
      }
      if (table.isBettingRoundInProgress()) {
        this.syncStacks(state, table)
        this.createDecision(state, table)
        state.engine = table.exportState()
        return
      }
      const priorBoardLength = table.communityCards().length
      table.endBettingRound()
      table
        .communityCards()
        .slice(priorBoardLength)
        .forEach((card, offset) =>
          effects.push({
            id: this.deps.id(),
            handId: state.currentHandId!,
            type: 'boardDealt',
            at: this.deps.clock.now(),
            data: { slot: priorBoardLength + offset, card }
          })
        )
    }
    table.showdown()
    this.syncStacks(state, table)
    if (table.exportState().phase === 'done') {
      const gameSeats = table.seats()
      for (const p of Object.values(state.participants))
        if (p.seatId !== null && gameSeats[p.seatId]) p.stack = gameSeats[p.seatId]!.stack
      state.engine = table.exportState()
      state.phase = 'showing'
      state.decision = null
      state.timers = state.timers.filter((timer) => timer.kind !== 'humanTurn')
      state.showingRemainingMs = state.rules.showingMs
      state.timers.push({
        timerId: this.deps.id(),
        generation: 1,
        kind: 'showing',
        participantId: null,
        remainingMs: state.rules.showingMs
      })
      if (state.handVisibility?.revealAllAfterHand || table.roundOfBetting() === 'showdown') {
        const cards = table.holeCards()
        for (const p of Object.values(state.participants)) {
          if (
            p.seatId === null ||
            !cards[p.seatId] ||
            (!state.handVisibility?.revealAllAfterHand && table.seats()[p.seatId]?.folded)
          )
            continue
          state.revealedSlots[p.participantId] = [0, 1]
        }
      }
      this.recordHand(state, table)
      effects.push({
        id: this.deps.id(),
        type: 'handSettled',
        handId: state.currentHandId!,
        at: this.deps.clock.now(),
        data: {
          handId: state.currentHandId!,
          winners: table.winners().map((win) => ({ seatId: win.seat, potIndex: win.pot, amount: win.amount }))
        }
      })
      return
    }
    state.engine = table.exportState()
  }

  private syncStacks(state: RoomState, table: Table): void {
    const seats = table.seats()
    for (const participant of Object.values(state.participants)) {
      if (participant.seatId !== null && seats[participant.seatId]) participant.stack = seats[participant.seatId]!.stack
    }
  }

  private finishShowing(state: RoomState, table: Table | null, effects: Effect[]): void {
    state.timers = state.timers.filter((timer) => timer.kind !== 'showing')
    for (const participant of Object.values(state.participants)) {
      if (participant.ghostSeat || participant.nextHandStand || participant.exited) {
        participant.seatId = null
        participant.ghostSeat = false
      }
      if (participant.nextHandSitOut !== null) {
        participant.sitOut = participant.nextHandSitOut
        participant.nextHandSitOut = null
      }
      if (participant.pendingStack > 0 && !participant.exited) {
        participant.stack = safeAdd(participant.stack, participant.pendingStack)
        participant.pendingStack = 0
      }
      participant.nextHandStand = false
      if (participant.exited) {
        participant.cashOutTotal = safeAdd(
          participant.cashOutTotal,
          safeAdd(participant.stack, participant.pendingStack)
        )
        participant.stack = 0
        participant.pendingStack = 0
      }
    }
    for (const participant of Object.values(state.participants)) {
      if (participant.exited || participant.nextHandSeatId === null || participant.nextHandSeatId === undefined)
        continue
      if (
        Object.values(state.participants).some(
          (other) => other.participantId !== participant.participantId && other.seatId === participant.nextHandSeatId
        )
      )
        continue
      participant.seatId = participant.nextHandSeatId
      participant.nextHandSeatId = null
    }
    if (table) state.engine = table.exportState()
    state.phase = 'waiting'
    state.showingRemainingMs = null
    state.waitingReason = 'insufficientReadyPlayers'
    if (!this.evaluateAutoStart(state, table, effects)) state.phase = 'waiting'
  }

  private evaluateAutoStart(state: RoomState, existing?: Table | null, effects?: Effect[]): boolean {
    if (!state.started || state.paused || state.recovering || state.phase !== 'waiting') return false
    const ready = Object.values(state.participants).filter(
      (p) => !p.exited && !p.ghostSeat && !p.sitOut && !p.nextHandStand && p.seatId !== null && p.stack > 0
    )
    if (ready.length < 2) {
      state.phase = 'waiting'
      state.waitingReason = 'insufficientReadyPlayers'
      return false
    }
    existing ??= state.engine ? Table.importState(state.engine, this.deps.random) : null
    let game =
      existing ??
      new Table(
        { smallBlind: state.rules.smallBlind, bigBlind: state.rules.bigBlind },
        state.rules.capacity,
        this.deps.random
      )
    if (existing) {
      const snapshot = game.exportState()
      snapshot.blinds = { smallBlind: state.rules.smallBlind, bigBlind: state.rules.bigBlind }
      game = Table.importState(snapshot, this.deps.random)
    }
    for (let seatId = 0; seatId < game.seats().length; seatId++) {
      if (game.seats()[seatId] && !ready.some((participant) => participant.seatId === seatId)) game.standUp(seatId)
    }
    game.resizeSeats(state.rules.capacity)
    for (const p of Object.values(state.participants)) {
      if (p.seatId === null) continue
      if (!ready.includes(p)) continue
      if (game.seats()[p.seatId]) game.setStack(p.seatId, p.stack)
      else game.sitDown(p.seatId, p.stack)
    }
    game.startHand()
    this.syncStacks(state, game)
    state.engine = game.exportState()
    state.phase = 'playing'
    state.waitingReason = null
    state.handNumber = game.handNumber()
    state.currentHandId = this.deps.id()
    state.handStartedAt = this.deps.clock.now()
    state.handSeatOwners = Object.fromEntries(ready.map((p) => [p.seatId!, p.participantId]))
    state.handVisibility = {
      spectatorVision: state.rules.spectatorVision,
      revealAllAfterHand: state.rules.revealAllAfterHand
    }
    state.handViewerControllerIds = Object.keys(state.controllers)
    state.revealedSlots = {}
    this.createDecision(state, game)
    effects?.push(...dealEffects(this.deps.id, state.currentHandId!, game, this.deps.clock.now()))
    if (!game.isBettingRoundInProgress()) this.advanceHand(state, game, effects ?? [])
    return true
  }

  private createDecision(state: RoomState, table: Table): void {
    state.timers = state.timers.filter((timer) => timer.kind !== 'humanTurn')
    if (!table.isBettingRoundInProgress()) {
      state.decision = null
      return
    }
    const seatId = table.playerToAct()
    const player = Object.values(state.participants).find((item) => item.seatId === seatId && !item.exited)
    if (!player) throw new RuntimeFault('ROOM_UNAVAILABLE', 'acting seat has no active participant')
    const prior = state.decision
    const sameDecision = prior?.handId === state.currentHandId && prior.seatId === seatId
    const deadlineRemainingMs =
      player.role === 'human'
        ? sameDecision && this.turnDeadlineAt !== null
          ? Math.max(0, this.turnDeadlineAt - this.deps.clock.now())
          : state.rules.humanTurnMs
        : null
    state.decision = {
      handId: state.currentHandId!,
      decisionId: sameDecision ? prior.decisionId : this.deps.id(),
      seatId,
      participantId: player.participantId,
      legalRevision: sameDecision ? prior.legalRevision : (prior?.legalRevision ?? 0) + 1,
      attemptId: player.role === 'agent' ? (sameDecision ? prior!.attemptId : this.deps.id()) : null,
      state: sameDecision ? prior.state : 'ready',
      deadlineRemainingMs,
      bufferedCandidate: sameDecision ? prior.bufferedCandidate : null
    }
    if (player.role === 'human')
      state.timers = state.timers
        .filter((timer) => timer.kind !== 'humanTurn')
        .concat({
          timerId: this.deps.id(),
          generation: 1,
          kind: 'humanTurn',
          participantId: player.participantId,
          remainingMs: deadlineRemainingMs!
        })
  }

  private checkDeadline(state: RoomState): void {
    if (!state.decision || state.participants[state.decision.participantId]?.role === 'agent') return
    if (this.turnDeadlineAt !== null && this.deps.clock.now() >= this.turnDeadlineAt)
      throw new RuntimeFault('STALE_DECISION', 'turn deadline has expired')
  }

  private removeParticipant(state: RoomState, participantId: string, table: Table | null, effects: Effect[]): void {
    const target = state.participants[participantId]
    if (!target) return
    target.exited = true
    const wasHost = state.hostId === participantId
    const humans = Object.values(state.participants).filter(
      (p) => p.role === 'human' && !p.exited && state.controllers[p.controllerId]?.online
    )
    if (!Object.values(state.participants).some((p) => p.role === 'human' && !p.exited)) {
      this.closeState(state, 'lastHumanLeft')
      return
    }
    if (wasHost) state.hostId = humans.sort((a, b) => a.joinOrder - b.joinOrder)[0]?.participantId ?? null
    if (state.phase === 'waiting' || state.phase === 'showing') {
      target.cashOutTotal = safeAdd(target.cashOutTotal, safeAdd(target.stack, target.pendingStack))
      target.stack = 0
      target.pendingStack = 0
    }
    if (target.seatId !== null && table && !table.seats()[target.seatId]?.allIn) {
      if (table.forceFold(target.seatId)) {
        this.syncStacks(state, table)
        this.advanceHand(state, table, effects)
      }
      target.ghostSeat = false
    } else if (target.seatId !== null && table?.seats()[target.seatId]?.allIn) target.ghostSeat = true
    if (table) state.engine = table.exportState()
  }

  private closeState(state: RoomState, reason: 'hostClosed' | 'lastHumanLeft'): void {
    if (state.phase === 'closed') return
    state.closeReason = reason
    state.closeOutcome =
      state.engine && state.phase !== 'showing' && state.phase !== 'waiting' ? 'terminated' : 'settled'
    state.phase = 'closed'
    state.closedAt = this.deps.clock.now()
    state.timers = []
    state.paused = false
    state.decision = null
    state.showingRemainingMs = null
    // Preserve all committed chips. An unfinished pot is left as a terminated contribution for the receipt path.
    const table = state.engine ? Table.importState(state.engine, this.deps.random) : null
    for (const participant of Object.values(state.participants)) {
      if (state.closeOutcome === 'terminated' && participant.seatId !== null)
        participant.abandonedContribution = safeAdd(
          participant.abandonedContribution,
          table?.seats()[participant.seatId]?.totalIn ?? 0
        )
      if (participant.stack || participant.pendingStack) {
        participant.cashOutTotal = safeAdd(
          participant.cashOutTotal,
          safeAdd(participant.stack, participant.pendingStack)
        )
        participant.stack = 0
        participant.pendingStack = 0
      }
    }
    state.recovering = false
    state.deferredRemovals = []
  }

  private recordChange(state: RoomState, controllerId: string, data: PersonalChange['data']): void {
    const entries = (state.history[controllerId] ??= [])
    const revision = entries.length + 1
    entries.push({
      revision,
      eventId: this.deps.id(),
      roomId: state.roomId,
      controllerId,
      at: this.deps.clock.now(),
      data
    })
    state.historyHeads[controllerId] = revision
  }

  private recordHand(state: RoomState, table: Table, revealOnly = false): void {
    const saved = table.exportState()
    for (const controller of Object.values(state.controllers)) {
      const view = projectRoom(state, {
        controllerId: controller.controllerId,
        serverEpoch: this.deps.serverEpoch,
        sessionGeneration: controller.generation,
        viewSeq: 1,
        serverAt: this.deps.clock.now(),
        reset: true,
        turnDeadlineAt: null,
        random: this.deps.random
      }).view
      const player = state.participants[controller.participantId]
      const seatId = Object.entries(state.handSeatOwners).find(([, id]) => id === player.participantId)?.[0]
      const own = seatId === undefined ? null : saved.seats[Number(seatId)]
      const net = own ? own.stack - own.startStack - own.stackAdjustment : 0
      if (!revealOnly && own) player.settledNet += net
      const previous = state.history[controller.controllerId]
        ?.slice()
        .reverse()
        .find((item) => item.data.type === 'hand.upsert' && item.data.record.handId === state.currentHandId)
      const record: PersonalHandRecord = {
        roomId: state.roomId,
        handId: state.currentHandId!,
        handNumber: state.handNumber,
        viewerParticipantId: player.participantId,
        startedAt: state.handStartedAt!,
        endedAt: this.deps.clock.now(),
        status: 'settled',
        smallBlind: saved.blinds.smallBlind,
        bigBlind: saved.blinds.bigBlind,
        board: saved.board,
        players: Object.entries(state.handSeatOwners).map(([id, participantId]) => {
          const seat = saved.seats[Number(id)]!
          const visible = view.participants.find((p) => p.participantId === participantId)
          return {
            participantId,
            name: state.participants[participantId].display.name,
            role: state.participants[participantId].role,
            seatId: Number(id),
            hole: visible?.hole ?? [{ visibility: 'hidden' }, { visibility: 'hidden' }],
            folded: seat.folded,
            allIn: seat.allIn,
            paid: seat.totalIn,
            won: saved.wins.filter((win) => win.seat === Number(id)).reduce((sum, win) => sum + win.amount, 0),
            net: seat.stack - seat.startStack - seat.stackAdjustment
          }
        }),
        publicActions: saved.log.flatMap((entry, index) =>
          'seat' in entry
            ? [
                {
                  id: this.deps.id(),
                  street: entry.street,
                  seatId: entry.seat,
                  action: entry.type,
                  paidDelta: entry.amount,
                  at: this.deps.clock.now()
                }
              ]
            : []
        ),
        winners: saved.wins.map((win) => ({ seatId: win.seat, potIndex: win.pot, amount: win.amount })),
        ownNet: own ? net : null,
        ownVPIP: saved.log.some(
          (entry) => 'seat' in entry && entry.seat === Number(seatId) && ['call', 'bet', 'raise'].includes(entry.type)
        ),
        ownPFR: saved.log.some(
          (entry) =>
            'seat' in entry &&
            entry.seat === Number(seatId) &&
            entry.street === 'preflop' &&
            ['bet', 'raise'].includes(entry.type)
        ),
        showdown: saved.street === 'showdown',
        visibilityRevision: (previous?.data.type === 'hand.upsert' ? previous.data.record.visibilityRevision : 0) + 1
      }
      this.recordChange(state, controller.controllerId, { type: 'hand.upsert', record })
    }
  }

  archiveResult(controllerId: string, command: BoundCommand): RuntimeResult {
    const after = Number((command.payload as { afterRevision?: number }).afterRevision ?? 0)
    const history = this.state.history[controllerId] ?? []
    const items = history.slice(after, after + 25)
    return {
      kind: 'ack',
      ack: {
        kind: 'ack',
        commandId: command.commandId,
        roomVersion: this.state.version,
        historyHead: history.length,
        result: { items }
      },
      projections: []
    }
  }

  private prepareCommit(
    state: RoomState,
    receipt: CommandReceipt | null,
    effects: Effect[],
    reset: boolean
  ): { commit: RoomCommit; projections: Projection[] } {
    for (const controller of Object.values(state.controllers)) {
      const p = state.participants[controller.participantId]
      const hands = new Map<string, PersonalHandRecord>()
      for (const item of state.history[controller.controllerId] ?? [])
        if (item.data.type === 'hand.upsert') hands.set(item.data.record.handId, item.data.record)
      const records = [...hands.values()].filter((hand) => hand.ownNet !== null)
      const summary: PersonalRoomSummary = {
        roomId: state.roomId,
        participantId: p.participantId,
        profileId: p.profileId,
        status: state.phase === 'closed' ? state.closeOutcome! : 'active',
        startedAt: state.createdAt,
        endedAt: state.closedAt,
        buyInTotal: p.buyInTotal,
        cashOutTotal: p.cashOutTotal,
        stack: p.stack,
        pendingStack: p.pendingStack,
        unsettledContribution: p.abandonedContribution,
        settledNet: p.settledNet,
        actualNet: state.phase === 'closed' ? p.cashOutTotal - p.buyInTotal : null,
        abandonedContribution: p.abandonedContribution,
        handsWon: records.filter((h) => h.ownNet! > 0).length,
        handsLost: records.filter((h) => h.ownNet! < 0).length,
        handsTied: records.filter((h) => h.ownNet === 0).length
      }
      const prior = state.history[controller.controllerId]?.at(-1)
      if (prior?.data.type !== 'room.summary' || JSON.stringify(prior.data.summary) !== JSON.stringify(summary))
        this.recordChange(state, controller.controllerId, { type: 'room.summary', summary })
    }
    const projections: Projection[] = []
    for (const controller of Object.values(state.controllers)) {
      if (!controller.online) continue
      const resetForController = reset && receipt?.controllerId === controller.controllerId
      const nextSeq = (this.viewSeq.get(controller.controllerId) ?? 0) + 1
      const projection = projectRoom(state, {
        controllerId: controller.controllerId,
        serverEpoch: this.deps.serverEpoch,
        sessionGeneration: controller.generation,
        viewSeq: nextSeq,
        serverAt: this.deps.clock.now(),
        reset: resetForController,
        turnDeadlineAt: this.projectedDeadline(state),
        random: this.deps.random
      })
      projection.effects = resetForController ? [] : effects
      projections.push(projection)
    }
    return { commit: { nextState: state, receipt }, projections }
  }

  private async commit(
    state: RoomState,
    receipt: CommandReceipt | null,
    effects: Effect[],
    reset: boolean,
    bootstrapReceipt?: BootstrapReceipt
  ): Promise<{ state: RoomState; projections: Projection[] }> {
    state.version = this.state.version + 1
    this.captureRemaining(state)
    const prepared = this.prepareCommit(state, receipt, effects, reset)
    prepared.commit.bootstrapReceipt = bootstrapReceipt
    await this.persist(prepared.commit)
    this.updateDeadline(this.state, state)
    this.state = state
    this.viewSeq.clear()
    for (const projection of prepared.projections) this.viewSeq.set(projection.controllerId, projection.viewSeq)
    this.rescheduleTimers()
    await Promise.resolve()
      .then(() => this.deps.deliver?.(prepared.projections))
      .catch(() => undefined)
    return { state, projections: prepared.projections }
  }

  private makeProjection(controllerId: string, reset: boolean): Projection {
    const controller = this.state.controllers[controllerId]
    if (!controller) throw new RuntimeFault('CONTROLLER_MISMATCH', 'controller is not in this room')
    const viewSeq = reset ? 1 : (this.viewSeq.get(controllerId) ?? 0) + 1
    this.viewSeq.set(controllerId, viewSeq)
    return projectRoom(this.state, {
      controllerId,
      serverEpoch: this.deps.serverEpoch,
      sessionGeneration: controller.generation,
      viewSeq,
      serverAt: this.deps.clock.now(),
      reset,
      turnDeadlineAt: this.projectedDeadline(this.state),
      random: this.deps.random
    })
  }

  private projectedDeadline(state: RoomState): number | null {
    if (
      state.paused ||
      state.recovering ||
      !state.decision ||
      state.participants[state.decision.participantId]?.role !== 'human'
    )
      return null
    const sameDecision = this.state.decision?.decisionId === state.decision.decisionId
    if (sameDecision && !this.state.paused && this.turnDeadlineAt !== null) return this.turnDeadlineAt
    return this.deps.clock.now() + (state.decision.deadlineRemainingMs ?? 0)
  }

  private updateDeadline(previous: RoomState, next: RoomState): void {
    if (
      next.paused ||
      next.recovering ||
      !next.decision ||
      next.participants[next.decision.participantId]?.role !== 'human'
    ) {
      this.turnDeadlineAt = null
      return
    }
    const sameDecision = previous.decision?.decisionId === next.decision.decisionId
    this.turnDeadlineAt =
      sameDecision && !previous.paused && this.turnDeadlineAt !== null
        ? this.turnDeadlineAt
        : this.deps.clock.now() + (next.decision.deadlineRemainingMs ?? 0)
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private async persist(input: RoomCommit): Promise<void> {
    try {
      await this.deps.store.commit(input)
    } catch {
      this.failed = true
      this.cancelTimers()
      throw new RuntimeFault('STORE_UNAVAILABLE', 'room persistence unavailable; retry the same command', true)
    }
  }

  private acceptSequences(projections: Projection[]): void {
    for (const projection of projections) this.viewSeq.set(projection.controllerId, projection.viewSeq)
  }

  private captureRemaining(candidate: RoomState): void {
    const now = this.deps.clock.now()
    for (const timer of candidate.timers) {
      const due = this.timerDue.get(timer.timerId)
      if (due !== undefined) timer.remainingMs = Math.max(0, due - now)
      if (timer.kind === 'showing') candidate.showingRemainingMs = timer.remainingMs
      if (timer.kind === 'disconnectGrace' && timer.participantId) {
        const participant = candidate.participants[timer.participantId]
        if (participant) candidate.controllers[participant.controllerId].offlineRemainingMs = timer.remainingMs
      }
    }
    if (
      candidate.decision &&
      candidate.decision.decisionId === this.state.decision?.decisionId &&
      this.turnDeadlineAt !== null
    )
      candidate.decision.deadlineRemainingMs = Math.max(0, this.turnDeadlineAt - now)
  }

  private timerDueAt(timerId: string): number {
    const scheduled = this.timerDue.get(timerId)
    return scheduled ?? this.deps.clock.now()
  }

  private timerDue = new Map<string, number>()

  private rescheduleTimers(): void {
    const live = new Set(this.state.timers.map((timer) => timer.timerId))
    for (const [timerId, handle] of this.timerHandles) {
      if (!live.has(timerId)) {
        this.deps.clock.clearTimeout(handle)
        this.timerHandles.delete(timerId)
        this.timerDue.delete(timerId)
      }
    }
    if (this.state.paused || this.state.recovering) {
      for (const timer of this.state.timers) {
        if (timer.kind === 'disconnectGrace') continue
        const handle = this.timerHandles.get(timer.timerId)
        if (handle !== undefined) {
          this.deps.clock.clearTimeout(handle)
          this.timerHandles.delete(timer.timerId)
          this.timerDue.delete(timer.timerId)
        }
      }
      for (const timer of this.state.timers) {
        if (timer.kind !== 'disconnectGrace' || this.timerHandles.has(timer.timerId)) continue
        const delay = Math.max(0, timer.remainingMs)
        this.timerDue.set(timer.timerId, this.deps.clock.now() + delay)
        const handle = this.deps.clock.setTimeout(() => this.fireTimer(timer.timerId, timer.generation), delay)
        this.timerHandles.set(timer.timerId, handle)
      }
      return
    }
    for (const timer of this.state.timers) {
      if (this.timerHandles.has(timer.timerId)) continue
      const delay = Math.max(0, timer.remainingMs)
      this.timerDue.set(timer.timerId, this.deps.clock.now() + delay)
      const handle = this.deps.clock.setTimeout(() => this.fireTimer(timer.timerId, timer.generation), delay)
      this.timerHandles.set(timer.timerId, handle)
    }
  }

  private fireTimer(timerId: string, generation: number): void {
    this.timerHandles.delete(timerId)
    this.timerDue.delete(timerId)
    void this.handleTimer(timerId, generation).catch(() => this.rescheduleTimers())
  }

  private cancelTimers(): void {
    for (const handle of this.timerHandles.values()) this.deps.clock.clearTimeout(handle)
    this.timerHandles.clear()
    this.timerDue.clear()
  }

  private handleTimer(timerId: string, generation: number): Promise<void> {
    return this.enqueue(async () => {
      const timer = this.state.timers.find((entry) => entry.timerId === timerId && entry.generation === generation)
      if (
        this.failed ||
        !timer ||
        ((this.state.paused || this.state.recovering) && timer.kind !== 'disconnectGrace') ||
        this.state.phase === 'closed'
      )
        return
      const candidate = structuredClone(this.state)
      const pending = candidate.timers.find((entry) => entry.timerId === timerId && entry.generation === generation)
      if (!pending) return
      candidate.timers = candidate.timers.filter((entry) => entry.timerId !== timerId)
      const effects: Effect[] = []
      if (timer.kind === 'humanTurn' && candidate.decision?.participantId === timer.participantId) {
        const table = candidate.engine ? Table.importState(candidate.engine, this.deps.random) : null
        if (table?.isBettingRoundInProgress())
          table.actionTaken(table.legalActions().actions.includes('check') ? 'check' : 'fold')
        if (table) {
          candidate.engine = table.exportState()
          candidate.decision = null
          this.advanceHand(candidate, table, effects)
        }
      } else if (timer.kind === 'disconnectGrace' && timer.participantId) {
        const target = candidate.participants[timer.participantId]
        const table = candidate.engine ? Table.importState(candidate.engine, this.deps.random) : null
        if (target && !candidate.controllers[target.controllerId]?.online) {
          if (
            candidate.paused &&
            Object.values(candidate.participants).some(
              (p) =>
                p.role === 'human' &&
                !p.exited &&
                p.participantId !== target.participantId &&
                !candidate.deferredRemovals.includes(p.participantId)
            )
          ) {
            if (!candidate.deferredRemovals.includes(target.participantId))
              candidate.deferredRemovals.push(target.participantId)
            if (candidate.hostId === target.participantId) {
              const replacement = Object.values(candidate.participants)
                .filter(
                  (item) => item.role === 'human' && !item.exited && candidate.controllers[item.controllerId]?.online
                )
                .sort((a, b) => a.joinOrder - b.joinOrder)[0]
              candidate.hostId = replacement?.participantId ?? null
            }
          } else this.removeParticipant(candidate, target.participantId, table, effects)
        }
        if (table) candidate.engine = table.exportState()
      } else if (timer.kind === 'showing') {
        const table = candidate.engine ? Table.importState(candidate.engine, this.deps.random) : null
        this.finishShowing(candidate, table, effects)
      }
      candidate.version += 1
      this.captureRemaining(candidate)
      const prepared = this.prepareCommit(candidate, null, effects, false)
      await this.persist(prepared.commit)
      this.updateDeadline(this.state, candidate)
      this.state = candidate
      this.acceptSequences(prepared.projections)
      this.rescheduleTimers()
      await Promise.resolve()
        .then(() => this.deps.deliver?.(prepared.projections))
        .catch(() => undefined)
    })
  }
}

function safeAdd(a: number, b: number): number {
  const value = a + b
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RuntimeFault('CHIP_LIMIT', 'chip total is outside the safe integer range')
  return value
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`)
    .join(',')}}`
}

function reject(commandId: string, code: Reject['code'], detail: string, retryable = false): RuntimeResult {
  return { kind: 'reject', reject: { kind: 'reject', commandId, code, detail, retryable } }
}

function asRuntimeFault(cause: unknown): RuntimeFault {
  if (cause instanceof RuntimeFault) return cause
  if (cause instanceof Error && cause.message.includes('chip')) return new RuntimeFault('CHIP_LIMIT', cause.message)
  if (cause instanceof Error && cause.message.includes('illegal'))
    return new RuntimeFault('ILLEGAL_ACTION', cause.message)
  return new RuntimeFault('INVALID_PHASE', cause instanceof Error ? cause.message : String(cause))
}

function changeEffect(
  id: string,
  at: number,
  participantId: string,
  change:
    'joined' | 'seated' | 'stood' | 'disconnected' | 'reconnected' | 'removed' | 'hostTransferred' | 'sitOutChanged'
): Effect {
  return { id, type: 'participantChanged', at, data: { participantId, change } }
}

function dealEffects(id: () => string, handId: string, table: Table, at: number): Effect[] {
  const holes: Array<{ seatId: number; slot: 0 | 1; order: number }> = []
  const nextSlot = new Map<number, number>()
  for (const deal of table.dealEvents()) {
    if (deal.seat === null) continue
    const slot = (nextSlot.get(deal.seat) ?? 0) as 0 | 1
    nextSlot.set(deal.seat, slot + 1)
    holes.push({ seatId: deal.seat, slot, order: deal.seq })
  }
  return holes.map((hole) => ({ id: id(), handId, type: 'deal', at, data: hole }))
}

const DAY = 86_400_000
