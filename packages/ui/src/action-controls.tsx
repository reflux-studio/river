import { cn } from 'cn'
import type { KeyboardEventHandler } from 'react'

const Key = ({ k, dark }: { k: string; dark?: boolean }) => (
  <span
    className={cn(
      'hidden rounded border px-1 font-mono text-[11px] sm:inline',
      dark ? 'border-white/30 text-white/60' : 'border-input text-[#a1a1a6]'
    )}
  >
    {k}
  </span>
)
const btn = 'flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[10px] py-3 text-base whitespace-nowrap'
const ALL_IN = 'linear-gradient(180deg, oklch(0.62 0.21 28), oklch(0.52 0.2 25))'

export function ActionControls({
  canAct,
  canRaise,
  canFold = true,
  canCall = true,
  draft,
  isAllIn,
  callLabel,
  raiseLabel,
  foldLabel,
  onFold,
  onCall,
  onRaise,
  onStep,
  onDraft,
  onCommit,
  onKeyDown
}: {
  canAct: boolean
  canRaise: boolean
  canFold?: boolean
  canCall?: boolean
  draft: string
  isAllIn: boolean
  callLabel: string
  raiseLabel: string
  foldLabel: string
  onFold(): void
  onCall(): void
  onRaise(): void
  onStep(direction: number): void
  onDraft(value: string): void
  onCommit(): void
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}) {
  return (
    <div className={cn('river-action-controls flex items-stretch gap-2', !canAct && 'pointer-events-none opacity-40')}>
      <button
        disabled={!canAct || !canFold}
        onClick={onFold}
        className={cn(btn, 'border border-input bg-white hover:bg-accent')}
      >
        {foldLabel}
        <Key k="F" />
      </button>
      <button
        disabled={!canAct || !canCall}
        onClick={onCall}
        className={cn(btn, 'border border-input bg-white hover:bg-accent')}
      >
        {callLabel}
        <Key k="C" />
      </button>
      <div
        className={cn(
          'flex items-center overflow-hidden rounded-[10px] border border-input bg-white',
          !canRaise && 'opacity-40'
        )}
      >
        <button
          disabled={!canRaise}
          aria-label="减少加注"
          onClick={() => onStep(-1)}
          className="px-3 text-lg text-label"
        >
          −
        </button>
        <input
          aria-label="加注到"
          inputMode="numeric"
          disabled={!canRaise}
          value={canRaise ? draft : '—'}
          onChange={(e) => onDraft(e.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          className="field-sizing-content min-w-[76px] bg-transparent px-1.5 text-center text-base font-semibold outline-none focus:bg-divider"
        />
        <button
          disabled={!canRaise}
          aria-label="增加加注"
          onClick={() => onStep(1)}
          className="px-3 text-lg text-label"
        >
          +
        </button>
      </div>
      <button
        onClick={onRaise}
        disabled={!canRaise}
        className={cn(btn, 'flex-[1.2] font-medium text-white', !canRaise && 'opacity-40')}
        style={{ background: isAllIn ? ALL_IN : '#1d1d1f' }}
      >
        {raiseLabel}
        <Key k="R" dark />
      </button>
    </div>
  )
}
