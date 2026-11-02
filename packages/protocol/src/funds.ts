import { z } from 'zod'

export const MAX_CHIP = Number.MAX_SAFE_INTEGER
export const MAX_TRANSFER_AMOUNT = 1_000_000_000
export const ChipSchema = z.number().int().min(0).max(MAX_CHIP)
export const TransferAmountSchema = z.number().int().min(1).max(MAX_TRANSFER_AMOUNT)
export const SignedChipSchema = z.number().int().min(-MAX_CHIP).max(MAX_CHIP)
export type Chip = z.infer<typeof ChipSchema>
export type TransferAmount = z.infer<typeof TransferAmountSchema>
export type SignedChip = z.infer<typeof SignedChipSchema>

export const FundingEntrySchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  participantId: z.string().uuid(),
  handId: z.string().uuid().nullable(),
  commandId: z.string().uuid(),
  direction: z.enum(['buyIn', 'cashOut']),
  amount: TransferAmountSchema,
  sourceOrDestination: z.enum(['stack', 'pending']),
  affectsCurrentHand: z.boolean(),
  at: z.number().int().nonnegative()
})
export type FundingEntry = z.infer<typeof FundingEntrySchema>
