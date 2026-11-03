import type { TableState } from '@river/engine/state'
import type {
  Ack,
  Chip,
  CommandPayload,
  Effect,
  PersonalChange,
  RoomView,
  SignedChip
} from '@river/protocol'

export type RoomRules = CommandPayload<'room.rules'>['rules']

export interface ParticipantState {
  participantId: string
  profileId: string | null
  role: 'human' | 'agent'
  controllerId: string
  joinOrder: number
  display: { name: string; ini: string; hue: number }
  seatId: number | null
  nextHandSeatId: number | null
  sitOut: boolean
  nextHandSitOut: boolean | null
  nextHandStand: boolean
  stack: Chip
  pendingStack: Chip
  buyInTotal: Chip
  cashOutTotal: Chip
  settledNet: SignedChip
  abandonedContribution: Chip
  exited: boolean
  ghostSeat: boolean
}

export interface ControllerState {
  controllerId: string
  participantId: string
  secretHash: string
  generation: number
  role: 'human' | 'agent'
  online: boolean
  offlineRemainingMs: number | null
  providerGrantId: string | null
}

export interface TimerState {
  timerId: string
  generation: number
  kind: 'humanTurn' | 'disconnectGrace' | 'showing'
  participantId: string | null
  remainingMs: number
}

export interface DecisionState {
  handId: string
  decisionId: string
  seatId: number
  participantId: string
  legalRevision: number
  attemptId: string | null
  state: 'ready' | 'agentThinking' | 'blocked' | 'buffered'
  deadlineRemainingMs: number | null
  bufferedCandidate: {
    action: 'fold' | 'check' | 'call' | 'raise'
    raiseTo?: Chip
    showSlots?: (0 | 1)[]
    talk?: string
  } | null
}

export interface RoomState {
  schemaVersion: 1
  roomId: string
  version: number
  phase: 'waiting' | 'playing' | 'blocked' | 'showing' | 'closed'
  rules: RoomRules
  rulesVersion: number
  hostId: string | null
  createdAt: number
  closedAt: number | null
  closeReason: 'hostClosed' | 'lastHumanLeft' | null
  closeOutcome: 'settled' | 'terminated' | null
  participants: Record<string, ParticipantState>
  controllers: Record<string, ControllerState>
  engine: TableState | null
  currentHandId: string | null
  handStartedAt: number | null
  handSeatOwners: Record<number, string>
  handVisibility: { spectatorVision: boolean; revealAllAfterHand: boolean } | null
  handViewerControllerIds: string[]
  handNumber: number
  paused: boolean
  recovering: boolean
  started: boolean
  waitingReason: 'notStarted' | 'insufficientReadyPlayers' | null
  timers: TimerState[]
  decision: DecisionState | null
  deferredRemovals: string[]
  publicChat: RoomView['chat']
  historyHeads: Record<string, number>
  history: Record<string, PersonalChange[]>
  revealedSlots: Record<string, (0 | 1)[]>
  showingRemainingMs: number | null
  providers: Record<string, { grantId: string; maxAgents: number }>
}

export interface RoomRecord {
  roomId: string
  version: number
  phase: RoomState['phase']
  snapshot: RoomState
  updatedAt: number
  closedAt: number | null
}

export interface CommandReceipt {
  roomId: string
  controllerId: string
  commandId: string
  payloadHash: string
  roomVersion: number
  result: Ack['result'] | { code: string; retryable: boolean; detail?: string }
  createdAt: number
}

export interface RoomCommit {
  nextState: RoomState
  receipt: CommandReceipt | null
  bootstrapReceipt?: BootstrapReceipt
}

/** One local transaction saves the authority and its command result. */
export interface RoomStore {
  loadActive(): Promise<RoomRecord[]>
  load(roomId: string): Promise<RoomRecord | null>
  findCommand(roomId: string, controllerId: string, commandId: string): Promise<CommandReceipt | null>
  findBootstrap(controllerId: string, commandId: string): Promise<BootstrapReceipt | null>
  commit(input: RoomCommit): Promise<void>
  cleanupClosed(before: number): Promise<void>
}

export interface BootstrapReceipt {
  controllerId: string
  commandId: string
  payloadHash: string
  secretHash: string
  roomId: string
  result: { roomId: string; participantId: string; controllerId: string }
  expiresAt: number
}

export type RoomEffect = Effect
