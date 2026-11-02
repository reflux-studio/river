import { z } from 'zod'
import { BoundCommandSchema, RoomRulesSchema } from './commands'
import { ChipSchema } from './funds'
import { ArchivePageSchema, EffectSchema, RoomViewSchema } from './views'

const id = z.string().uuid()
// Protocol v1 object schemas strip unknown keys. New wire fields require an explicit protocol revision.
export const HelloSchema = z.object({
  kind: z.literal('hello'),
  protocol: z.literal(1),
  clientVersion: z.string().min(1),
  platform: z.enum(['web', 'desktop'])
})
export const WelcomeSchema = z.object({
  kind: z.literal('welcome'),
  protocol: z.literal(1),
  connectionId: id,
  serverAt: z.number().int().nonnegative(),
  heartbeatMs: z.number().int().positive()
})
export const CredentialSchema = z.object({ controllerId: id, resumeSecret: z.string().min(40) })
export const PublicProfileSchema = z.object({
  profileId: id,
  name: z.string().min(1).max(80),
  ini: z.string().max(8),
  hue: z.number().int().min(0).max(359),
  locale: z.enum(['zh', 'en'])
})
export const PublicAgentProfileSchema = z.object({
  name: z.string().min(1).max(80),
  ini: z.string().max(8),
  hue: z.number().int().min(0).max(359),
  templateId: z.string().min(1)
})
export const BootstrapCommandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('room.create'),
    commandId: id,
    credential: CredentialSchema,
    profile: PublicProfileSchema,
    rules: RoomRulesSchema
  }),
  z.object({
    kind: z.literal('room.join'),
    commandId: id,
    roomId: id,
    credential: CredentialSchema,
    profile: PublicProfileSchema
  }),
  z.object({
    kind: z.literal('session.resume'),
    roomId: id,
    credential: CredentialSchema,
    lastViewSeq: z.number().int().nonnegative().optional()
  }),
  z.object({ kind: z.literal('archive.authenticate'), roomId: id, credential: CredentialSchema })
])
export const BoundSchema = z.object({
  kind: z.literal('bound'),
  roomId: id,
  participantId: id,
  controllerId: id,
  serverEpoch: id,
  sessionGeneration: z.number().int().positive(),
  historyHead: z.number().int().nonnegative()
})
export const AckResultSchema = z.union([
  ArchivePageSchema,
  z.object({
    status: z.literal('applied'),
    fundingId: id,
    amount: ChipSchema,
    destination: z.enum(['stack', 'pending'])
  }),
  z.object({
    status: z.literal('applied'),
    grantId: id,
    providerParticipantId: id,
    maxAgents: z.number().int().min(1).max(9)
  }),
  z.object({ status: z.literal('applied'), participantId: id, controllerId: id }),
  z.object({ status: z.enum(['applied', 'scheduled', 'buffered']) })
])
export const AckSchema = z.object({
  kind: z.literal('ack'),
  commandId: id,
  roomVersion: z.number().int().nonnegative(),
  historyHead: z.number().int().nonnegative(),
  result: AckResultSchema
})
export const ErrorCodeSchema = z.enum([
  'PROTOCOL_UNSUPPORTED',
  'INVALID_PAYLOAD',
  'UNBOUND',
  'CONTROLLER_MISMATCH',
  'ROOM_NOT_FOUND',
  'ROOM_UNAVAILABLE',
  'ROOM_CLOSED',
  'ROOM_FULL',
  'SEAT_UNAVAILABLE',
  'NOT_HOST',
  'NOT_GRANTED',
  'INVALID_PHASE',
  'STALE_EPOCH',
  'STALE_DECISION',
  'ILLEGAL_ACTION',
  'INSUFFICIENT_CHIPS',
  'ALREADY_ALL_IN',
  'COMMAND_CONFLICT',
  'RATE_LIMITED',
  'CHIP_LIMIT',
  'STORE_UNAVAILABLE',
  'SCHEMA_UNSUPPORTED'
])
export const RejectSchema = z.object({
  kind: z.literal('reject'),
  commandId: id.optional(),
  code: ErrorCodeSchema,
  retryable: z.boolean(),
  detail: z.string().optional()
})
export const ProjectionSchema = z.object({
  kind: z.literal('projection'),
  protocol: z.literal(1),
  roomId: id,
  serverEpoch: id,
  controllerId: id,
  sessionGeneration: z.number().int().positive(),
  viewSeq: z.number().int().positive(),
  roomVersion: z.number().int().nonnegative(),
  serverAt: z.number().int().nonnegative(),
  reset: z.boolean(),
  view: RoomViewSchema,
  effects: z.array(EffectSchema)
})
export const ProtocolInputSchema = z.union([HelloSchema, BootstrapCommandSchema, BoundCommandSchema])
export const ProtocolOutputSchema = z.union([WelcomeSchema, BoundSchema, AckSchema, RejectSchema, ProjectionSchema])

export type Hello = z.infer<typeof HelloSchema>
export type Welcome = z.infer<typeof WelcomeSchema>
export type Credential = z.infer<typeof CredentialSchema>
export type PublicProfile = z.infer<typeof PublicProfileSchema>
export type PublicAgentProfile = z.infer<typeof PublicAgentProfileSchema>
export type BootstrapCommand = z.infer<typeof BootstrapCommandSchema>
export type Bound = z.infer<typeof BoundSchema>
export type Ack = z.infer<typeof AckSchema>
export type ErrorCode = z.infer<typeof ErrorCodeSchema>
export type Reject = z.infer<typeof RejectSchema>
export type Projection = z.infer<typeof ProjectionSchema>
