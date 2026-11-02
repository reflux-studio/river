import { Table } from '@river/engine'
import type { RandomInput } from '@river/engine'
import {
  RoomViewSchema,
  type Effect,
  type HoleSlot,
  type ParticipantView,
  type Projection,
  type RoomView
} from '@river/protocol'
import type { RoomState } from '@river/storage/room'

export interface ProjectionContext {
  controllerId: string
  serverEpoch: string
  sessionGeneration: number
  viewSeq: number
  serverAt: number
  reset: boolean
  turnDeadlineAt: number | null
  random: RandomInput
}

/** Creates a receiver-specific projection. The full engine snapshot is never serialized. */
export function projectRoom(state: RoomState, context: ProjectionContext): Projection {
  const selfController = state.controllers[context.controllerId]
  if (!selfController) throw new Error('controller is not a room member')
  const selfParticipant = state.participants[selfController.participantId]
  if (!selfParticipant) throw new Error('controller participant is missing')
  const canViewRetainedHand = state.phase !== 'waiting' || state.handViewerControllerIds?.includes(context.controllerId)
  const engine = state.engine && canViewRetainedHand ? Table.importState(state.engine, context.random) : null
  const board = engine?.communityCards() ?? []
  const seats = engine?.seats() ?? []
  const holeCards = engine?.holeCards() ?? []
  const ownSeated = selfParticipant.seatId !== null
  // Pot layers may be empty before the first bet is collected. A live player
  // still contests the hand then and must never receive opponents' hole cards.
  const ownSeat =
    ownSeated && state.handSeatOwners?.[selfParticipant.seatId!] === selfParticipant.participantId
      ? seats[selfParticipant.seatId!]
      : null
  const viewerInHand = !!ownSeat && holeCards[selfParticipant.seatId!]?.length === 2 && !ownSeat.folded && !ownSeat.out
  const spectatorVision = !!state.handVisibility?.spectatorVision && !viewerInHand
  const participants: ParticipantView[] = Object.values(state.participants).map((participant) => {
    const seatId = participant.seatId
    const belongsToCurrentHand = seatId !== null && state.handSeatOwners?.[seatId] === participant.participantId
    const engineSeat = belongsToCurrentHand ? (seats[seatId!] ?? null) : null
    const privateCards = belongsToCurrentHand ? (holeCards[seatId!] ?? null) : null
    const viewerIsOwner = participant.participantId === selfParticipant.participantId
    const spectatorCanSee = !!engine && spectatorVision
    const handOver = state.phase === 'showing' || state.phase === 'waiting' || state.phase === 'closed'
    const revealByPolicy = !!state.handVisibility?.revealAllAfterHand && handOver
    const publicShowdown = !!engine && engine.roundOfBetting() === 'showdown' && !engineSeat?.folded
    const shown = seatId === null ? [] : (state.revealedSlots[participant.participantId] ?? [])
    const canSeeCards = viewerIsOwner || spectatorCanSee || revealByPolicy || publicShowdown
    const hole: [HoleSlot, HoleSlot] | null =
      privateCards?.length === 2
        ? ([0, 1].map((slot) =>
            canSeeCards || shown.includes(slot as 0 | 1)
              ? {
                  visibility: 'known' as const,
                  card: privateCards[slot],
                  source: viewerIsOwner
                    ? ('own' as const)
                    : spectatorCanSee
                      ? ('spectator' as const)
                      : ('public' as const)
                }
              : { visibility: 'hidden' as const }
          ) as [HoleSlot, HoleSlot])
        : null
    return {
      participantId: participant.participantId,
      role: participant.role,
      seatId,
      name: participant.display.name,
      ini: participant.display.ini,
      hue: participant.display.hue,
      connected: !!state.controllers[participant.controllerId]?.online,
      disconnectExpiresAt: state.controllers[participant.controllerId]?.online
        ? null
        : context.serverAt + (state.controllers[participant.controllerId]?.offlineRemainingMs ?? 0),
      stack: participant.stack,
      pendingStack: participant.pendingStack,
      bet: engineSeat?.bet ?? 0,
      totalIn: engineSeat?.totalIn ?? 0,
      folded: engineSeat?.folded ?? false,
      allIn: engineSeat?.allIn ?? false,
      leaving: participant.nextHandStand || participant.exited,
      sittingOut: participant.sitOut || !!participant.nextHandSitOut,
      hole
    }
  })
  const current = state.decision
  const actor = current ? state.participants[current.participantId] : null
  const activeTurn =
    current && actor && engine?.isBettingRoundInProgress()
      ? (() => {
          const seat = engine.seats()[current.seatId]
          const payableToCall = engine.legalActions().toCall
          const requiredToCall = Math.max(0, engine.currentBet() - (seat?.bet ?? 0))
          const range = engine.legalActions().chipRange
          const actions = engine.legalActions().actions
          return {
            turn: {
              decisionId: current.decisionId,
              seatId: current.seatId,
              role: actor.role,
              state:
                current.state === 'blocked'
                  ? ('blocked' as const)
                  : current.state === 'agentThinking'
                    ? ('agentThinking' as const)
                    : ('ready' as const),
              deadlineAt: state.paused || state.recovering || actor.role === 'agent' ? null : context.turnDeadlineAt,
              remainingMs: state.paused && actor.role === 'human' ? current.deadlineRemainingMs : null
            },
            decision:
              actor.controllerId === context.controllerId
                ? {
                    handId: current.handId,
                    decisionId: current.decisionId,
                    legalRevision: current.legalRevision,
                    ...(current.attemptId ? { attemptId: current.attemptId } : {}),
                    legal: {
                      requiredToCall,
                      payableToCall,
                      canCheck: actions.includes('check'),
                      canFold: actions.includes('fold'),
                      canCall: actions.includes('call'),
                      minRaiseTo: range?.min ?? null,
                      maxRaiseTo: range?.max ?? null
                    }
                  }
                : null
          }
        })()
      : null
  const hand =
    engine && state.currentHandId
      ? {
          handId: state.currentHandId,
          number: state.handNumber,
          status:
            state.closeOutcome === 'settled' || state.phase === 'showing' || state.phase === 'waiting'
              ? ('settled' as const)
              : state.phase === 'closed'
                ? ('terminated' as const)
                : ('active' as const),
          street: engine.roundOfBetting(),
          board,
          pot: engine.totalPot(),
          pots: engine.pots().map((pot) => ({ amount: pot.size, eligibleSeatIds: pot.eligible })),
          buttonSeatId: engine.button(),
          sbSeatId: engine.blindSeats().sb,
          bbSeatId: engine.blindSeats().bb,
          actingSeatId: current?.seatId ?? null,
          turn: activeTurn?.turn ?? null,
          decision: activeTurn?.decision ?? null,
          showingEndsAt:
            state.phase === 'showing' && !state.paused ? context.serverAt + (state.showingRemainingMs ?? 0) : null,
          winners: engine
            .winners()
            .map((winner) => ({ seatId: winner.seat, potIndex: winner.pot, amount: winner.amount }))
        }
      : null
  const view: RoomView = {
    roomId: state.roomId,
    phase: state.phase,
    paused: state.paused,
    rules: state.rules,
    rulesVersion: state.rulesVersion,
    hostId: state.hostId,
    recovering: state.recovering,
    started: state.started,
    waitingReason: state.waitingReason,
    self: {
      participantId: selfParticipant.participantId,
      seatId: selfParticipant.seatId,
      viewMode: ownSeated ? 'player' : 'spectator',
      preAction: state.preActions[selfParticipant.participantId] ?? null,
      historyHead: state.historyHeads[context.controllerId] ?? 0,
      agentGrant: state.providers[selfParticipant.participantId] ?? null
    },
    participants,
    hand,
    chat: state.publicChat.slice(-100),
    ...(state.phase === 'closed' && state.closeReason && state.closeOutcome && state.closedAt !== null
      ? { closed: { reason: state.closeReason, outcome: state.closeOutcome, at: state.closedAt } }
      : {})
  }
  const validated = RoomViewSchema.parse(view)
  const projection: Projection = {
    kind: 'projection',
    protocol: 1,
    roomId: state.roomId,
    serverEpoch: context.serverEpoch,
    controllerId: context.controllerId,
    sessionGeneration: context.sessionGeneration,
    viewSeq: context.viewSeq,
    roomVersion: state.version,
    serverAt: context.serverAt,
    reset: context.reset,
    view: validated,
    effects: []
  }
  return projection
}
