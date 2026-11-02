import { z } from 'zod'
import { ChipSchema, SignedChipSchema } from './funds'
import { FundingEntrySchema } from './funds'
import { RoomRulesSchema } from './commands'

// Protocol v1 object schemas strip unknown keys. New wire fields require an explicit protocol revision.
const id = z.string().uuid()
const card = z.string().regex(/^[2-9TJQKA][shdc]$/)
const street = z.enum(['preflop', 'flop', 'turn', 'river', 'showdown'])
const seatId = z.number().int().min(0).max(9)
const timestamp = z.number().int().nonnegative()

export const HoleSlotSchema = z.discriminatedUnion('visibility', [
  z.object({ visibility: z.literal('hidden') }),
  z.object({ visibility: z.literal('known'), card, source: z.enum(['own', 'public', 'spectator']) })
])
export const PreActionSchema = z.object({
  handId: id,
  street: z.enum(['preflop', 'flop', 'turn', 'river']),
  action: z.enum(['check', 'fold', 'checkOrFold'])
})
export const PublicTurnViewSchema = z.object({
  decisionId: id,
  seatId,
  role: z.enum(['human', 'agent']),
  state: z.enum(['ready', 'agentThinking', 'blocked']),
  deadlineAt: timestamp.nullable(),
  remainingMs: z.number().int().nonnegative().nullable()
})
export const PrivateDecisionViewSchema = z.object({
  handId: id,
  decisionId: id,
  legalRevision: z.number().int().nonnegative(),
  attemptId: id.optional(),
  legal: z.object({
    requiredToCall: ChipSchema,
    payableToCall: ChipSchema,
    canCheck: z.boolean(),
    canFold: z.boolean(),
    canCall: z.boolean(),
    minRaiseTo: ChipSchema.nullable(),
    maxRaiseTo: ChipSchema.nullable()
  })
})
export const ParticipantViewSchema = z.object({
  participantId: id,
  role: z.enum(['human', 'agent']),
  seatId: seatId.nullable(),
  name: z.string(),
  ini: z.string(),
  hue: z.number().int(),
  connected: z.boolean(),
  disconnectExpiresAt: timestamp.nullable(),
  stack: ChipSchema,
  pendingStack: ChipSchema,
  bet: ChipSchema,
  totalIn: ChipSchema,
  folded: z.boolean(),
  allIn: z.boolean(),
  leaving: z.boolean(),
  sittingOut: z.boolean(),
  hole: z.tuple([HoleSlotSchema, HoleSlotSchema]).nullable(),
  equity: z
    .object({
      fraction: z.number().min(0).max(1),
      kind: z.literal('splitPotEquity'),
      estimated: z.boolean(),
      basedOnVersion: z.number().int().nonnegative()
    })
    .optional()
})
export const ChatMessageSchema = z.object({
  messageId: id,
  senderParticipantId: id,
  senderRole: z.enum(['human', 'agent']),
  senderName: z.string(),
  text: z.string().min(1).max(500),
  serverAt: timestamp
})
export const HandViewSchema = z.object({
  handId: id,
  number: z.number().int().positive(),
  status: z.enum(['active', 'settled', 'terminated']),
  street,
  board: z.array(card).max(5),
  pot: ChipSchema,
  pots: z.array(z.object({ amount: ChipSchema, eligibleSeatIds: z.array(seatId) })),
  buttonSeatId: seatId,
  sbSeatId: seatId,
  bbSeatId: seatId,
  actingSeatId: seatId.nullable(),
  turn: PublicTurnViewSchema.nullable(),
  decision: PrivateDecisionViewSchema.nullable(),
  showingEndsAt: timestamp.nullable(),
  winners: z.array(z.object({ seatId, potIndex: z.number().int().nonnegative(), amount: ChipSchema }))
})
export const RoomViewSchema = z.object({
  roomId: id,
  phase: z.enum(['waiting', 'playing', 'blocked', 'showing', 'closed']),
  paused: z.boolean(),
  rules: RoomRulesSchema,
  rulesVersion: z.number().int().positive(),
  hostId: id.nullable(),
  recovering: z.boolean(),
  started: z.boolean(),
  waitingReason: z.enum(['notStarted', 'insufficientReadyPlayers']).nullable(),
  self: z.object({
    participantId: id,
    seatId: seatId.nullable(),
    viewMode: z.enum(['player', 'spectator']),
    preAction: PreActionSchema.nullable(),
    historyHead: z.number().int().nonnegative(),
    agentGrant: z.object({ grantId: id, maxAgents: z.number().int() }).nullable().optional()
  }),
  participants: z.array(ParticipantViewSchema),
  hand: HandViewSchema.nullable(),
  chat: z.array(ChatMessageSchema).max(100),
  closed: z
    .object({
      reason: z.enum(['hostClosed', 'lastHumanLeft']),
      at: timestamp,
      outcome: z.enum(['settled', 'terminated'])
    })
    .optional()
})

const effectBase = { id, handId: id.optional(), at: timestamp }
export const EffectSchema = z.discriminatedUnion('type', [
  z.object({
    ...effectBase,
    type: z.literal('deal'),
    data: z.object({ seatId, slot: z.union([z.literal(0), z.literal(1)]), order: z.number().int().nonnegative() })
  }),
  z.object({
    ...effectBase,
    type: z.literal('actionApplied'),
    data: z.object({
      seatId,
      action: z.enum(['fold', 'check', 'call', 'raise']),
      paidDelta: ChipSchema,
      raiseTo: ChipSchema.optional()
    })
  }),
  z.object({
    ...effectBase,
    type: z.literal('boardDealt'),
    data: z.object({ slot: z.number().int().min(0).max(4), card })
  }),
  z.object({ ...effectBase, type: z.literal('potCollected'), data: z.object({ amount: ChipSchema }) }),
  z.object({
    ...effectBase,
    type: z.literal('handSettled'),
    data: z.object({
      handId: id,
      winners: z.array(z.object({ seatId, potIndex: z.number().int().nonnegative(), amount: ChipSchema }))
    })
  }),
  z.object({
    ...effectBase,
    type: z.literal('holeRevealed'),
    data: z.object({
      participantId: id,
      slots: z.array(z.object({ slot: z.union([z.literal(0), z.literal(1)]), card })).max(2)
    })
  }),
  z.object({ ...effectBase, type: z.literal('chatAdded'), data: ChatMessageSchema }),
  z.object({
    ...effectBase,
    type: z.literal('participantChanged'),
    data: z.object({
      participantId: id,
      change: z.enum([
        'joined',
        'seated',
        'stood',
        'disconnected',
        'reconnected',
        'removed',
        'hostTransferred',
        'sitOutChanged'
      ])
    })
  }),
  z.object({
    ...effectBase,
    type: z.literal('fundsChanged'),
    data: z.object({
      participantId: id,
      direction: z.enum(['buyIn', 'cashOut']),
      amount: ChipSchema,
      destination: z.enum(['stack', 'pending']).nullable()
    })
  }),
  z.object({ ...effectBase, type: z.literal('roomPaused'), data: z.object({ paused: z.boolean() }) }),
  z.object({
    ...effectBase,
    type: z.literal('roomClosed'),
    data: z.object({ reason: z.enum(['hostClosed', 'lastHumanLeft']) })
  })
])

export const PersonalPlayerRecordSchema = z.object({
  participantId: id,
  name: z.string(),
  role: z.enum(['human', 'agent']),
  seatId,
  hole: z.tuple([HoleSlotSchema, HoleSlotSchema]),
  folded: z.boolean(),
  allIn: z.boolean(),
  paid: ChipSchema,
  won: ChipSchema,
  net: SignedChipSchema.nullable()
})
export const PersonalHandRecordSchema = z.object({
  roomId: id,
  handId: id,
  handNumber: z.number().int().positive(),
  viewerParticipantId: id,
  startedAt: timestamp,
  endedAt: timestamp,
  status: z.enum(['settled', 'terminated']),
  smallBlind: ChipSchema,
  bigBlind: ChipSchema,
  board: z.array(card).max(5),
  players: z.array(PersonalPlayerRecordSchema).max(10),
  publicActions: z.array(
    z.object({
      id,
      street,
      seatId,
      action: z.string(),
      paidDelta: ChipSchema,
      raiseTo: ChipSchema.optional(),
      at: timestamp
    })
  ),
  winners: z.array(z.object({ seatId, potIndex: z.number().int().nonnegative(), amount: ChipSchema })),
  ownNet: SignedChipSchema.nullable(),
  ownVPIP: z.boolean(),
  ownPFR: z.boolean(),
  showdown: z.boolean(),
  visibilityRevision: z.number().int().nonnegative()
})
export const PersonalRoomSummarySchema = z.object({
  roomId: id,
  participantId: id,
  profileId: id.nullable(),
  status: z.enum(['active', 'settled', 'terminated']),
  startedAt: timestamp,
  endedAt: timestamp.nullable(),
  buyInTotal: ChipSchema,
  cashOutTotal: ChipSchema,
  stack: ChipSchema,
  pendingStack: ChipSchema,
  unsettledContribution: ChipSchema,
  settledNet: SignedChipSchema,
  actualNet: SignedChipSchema.nullable(),
  abandonedContribution: ChipSchema,
  handsWon: z.number().int().nonnegative(),
  handsLost: z.number().int().nonnegative(),
  handsTied: z.number().int().nonnegative()
})
export const PersonalChangeSchema = z.object({
  revision: z.number().int().positive(),
  eventId: id,
  roomId: id,
  controllerId: id,
  at: timestamp,
  data: z.discriminatedUnion('type', [
    z.object({ type: z.literal('funding'), entry: FundingEntrySchema }),
    z.object({ type: z.literal('hand.upsert'), record: PersonalHandRecordSchema }),
    z.object({ type: z.literal('room.summary'), summary: PersonalRoomSummarySchema })
  ])
})
export const ArchivePageSchema = z.object({ items: z.array(PersonalChangeSchema) })

export type HoleSlot = z.infer<typeof HoleSlotSchema>
export type PublicTurnView = z.infer<typeof PublicTurnViewSchema>
export type PrivateDecisionView = z.infer<typeof PrivateDecisionViewSchema>
export type ParticipantView = z.infer<typeof ParticipantViewSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type HandView = z.infer<typeof HandViewSchema>
export type RoomView = z.infer<typeof RoomViewSchema>
export type Effect = z.infer<typeof EffectSchema>
export type PersonalPlayerRecord = z.infer<typeof PersonalPlayerRecordSchema>
export type PersonalHandRecord = z.infer<typeof PersonalHandRecordSchema>
export type PersonalRoomSummary = z.infer<typeof PersonalRoomSummarySchema>
export type PersonalChange = z.infer<typeof PersonalChangeSchema>
export type ArchivePage = z.infer<typeof ArchivePageSchema>
