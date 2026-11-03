import { z } from 'zod'
import { ChipSchema, TransferAmountSchema } from './funds'

const id = z.string().uuid()
const decisionRef = z.object({
  handId: id,
  decisionId: id,
  legalRevision: z.number().int().nonnegative(),
  attemptId: id.optional()
})

// Protocol v1 object schemas strip unknown keys. New wire fields require an explicit protocol revision.
export const RoomRulesSchema = z
  .object({
    capacity: z.union([
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
      z.literal(7),
      z.literal(8),
      z.literal(9),
      z.literal(10)
    ]),
    smallBlind: TransferAmountSchema,
    bigBlind: TransferAmountSchema,
    defaultBuyIn: TransferAmountSchema,
    humanTurnMs: z.number().int().min(5_000).max(300_000),
    disconnectGraceMs: z.number().int().min(10_000).max(600_000),
    showingMs: z.number().int().min(1_000).max(60_000),
    coachAllowed: z.boolean(),
    revealAllAfterHand: z.boolean(),
    spectatorVision: z.boolean()
  })
  .refine((r) => r.smallBlind <= r.bigBlind, { path: ['smallBlind'], message: 'smallBlind must not exceed bigBlind' })

export const CommandPayloadSchemas = {
  'room.start': z.object({}),
  'room.rules': z.object({ rules: RoomRulesSchema }),
  'seat.sit': z.object({ seatId: z.number().int().min(0).max(9) }),
  'seat.stand': z.object({ when: z.enum(['now', 'nextHand']) }),
  'seat.sitOut': z.object({ enabled: z.boolean() }),
  'room.leave': z.object({}),
  'funds.buyIn': z.object({ amount: TransferAmountSchema }),
  'funds.cashOut': z.object({ amount: TransferAmountSchema, source: z.enum(['stack', 'pending']) }),
  'hand.act': decisionRef.extend({
    action: z.enum(['fold', 'check', 'call', 'raise']),
    raiseTo: ChipSchema.optional()
  }),
  'decision.failed': decisionRef.extend({
    errorKind: z.enum(['timeout', 'provider', 'invalidOutput']),
    message: z.string()
  }),
  'decision.retry': z.object({ decisionId: id }),
  'participant.remove': z.object({ targetParticipantId: id }),
  'host.transfer': z.object({ targetParticipantId: id }),
  'hand.reveal': z.object({ handId: id, slots: z.array(z.union([z.literal(0), z.literal(1)])).max(2) }),
  'hand.skipShowing': z.object({ handId: id }),
  'room.pause': z.object({}),
  'room.resume': z.object({}),
  'room.close': z.object({}),
  'chat.send': z.object({ text: z.string().min(1).max(500) }),
  'agent.grant': z.object({ providerParticipantId: id, maxAgents: z.number().int().min(1).max(9) }),
  'agent.create': z.object({
    grantId: id,
    credential: z.object({ controllerId: id, resumeSecret: z.string().min(40) }),
    profile: z.object({
      name: z.string().min(1).max(80),
      ini: z.string().max(8),
      hue: z.number().int().min(0).max(359),
      templateId: z.string().min(1).max(128)
    })
  }),
  'archive.get': z.object({ afterRevision: z.number().int().nonnegative().optional() }),
  'state.sync': z.object({})
} as const

export type CommandType = keyof typeof CommandPayloadSchemas
export type CommandPayload<T extends CommandType = CommandType> = z.infer<(typeof CommandPayloadSchemas)[T]>
export function parseCommandPayload<T extends CommandType>(type: T, payload: unknown): CommandPayload<T> {
  return CommandPayloadSchemas[type].parse(payload) as CommandPayload<T>
}

export const BoundCommandSchema = z
  .object({
    kind: z.literal('command'),
    protocol: z.literal(1),
    commandId: id,
    roomId: id,
    serverEpoch: z.string().min(1),
    type: z.string(),
    payload: z.unknown()
  })
  .superRefine((command, ctx) => {
    const schema = CommandPayloadSchemas[command.type as CommandType]
    if (!schema) {
      ctx.addIssue({ code: 'custom', path: ['type'], message: 'unsupported command type' })
      return
    }
    const parsed = schema.safeParse(command.payload)
    if (!parsed.success)
      ctx.addIssue({ code: 'custom', path: ['payload'], message: 'command payload does not match its type' })
  })
  .transform((command) => ({
    ...command,
    type: command.type as CommandType,
    payload: parseCommandPayload(command.type as CommandType, command.payload)
  }))
export type BoundCommand = z.infer<typeof BoundCommandSchema>
