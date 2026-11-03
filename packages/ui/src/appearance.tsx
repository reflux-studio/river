import { BACKS, backPattern, FELTS, RAINBOW } from './felt'
import { Segmented } from './segmented'
import type { Back, Felt, Fx } from './types'

export interface AppearanceValue {
  felt: Felt
  feltCustom: string
  back: Back
  fx: Fx
}

export interface AppearanceLabels {
  felt: string
  back: string
  fx: string
  custom: string
  fxOpts: Record<Fx, string>
}

const ON = '0 0 0 2px #fff, 0 0 0 4px #1d1d1f'
const OFF = '0 0 0 1px rgba(0,0,0,0.14)'

export function FeltSwatches({
  value,
  onChange,
  size = 26
}: {
  value: AppearanceValue
  onChange(value: AppearanceValue): void
  size?: number
}) {
  const custom = value.feltCustom
  return (
    <div className="flex flex-wrap gap-2">
      {FELTS.map((f) => (
        <button
          key={f.k}
          type="button"
          aria-label={f.k}
          onClick={() => onChange({ ...value, felt: f.k })}
          className="rounded-full"
          style={{ width: size, height: size, background: f.felt, boxShadow: value.felt === f.k ? ON : OFF }}
        />
      ))}
      <label
        className="relative block cursor-pointer rounded-full"
        style={{
          width: size,
          height: size,
          background: value.felt === 'custom' ? custom : RAINBOW,
          boxShadow: value.felt === 'custom' ? ON : OFF
        }}
      >
        <input
          type="color"
          value={custom}
          onChange={(e) => onChange({ ...value, felt: 'custom', feltCustom: e.target.value })}
          className="absolute inset-0 size-full cursor-pointer border-0 p-0 opacity-0"
        />
      </label>
    </div>
  )
}

export function BackSwatches({
  value,
  onChange
}: {
  value: AppearanceValue
  onChange(value: AppearanceValue): void
}) {
  return (
    <div className="flex gap-2">
      {BACKS.map((b) => (
        <button
          key={b.k}
          type="button"
          aria-label={b.k}
          onClick={() => onChange({ ...value, back: b.k })}
          className="box-border h-7 w-5 rounded bg-white p-0.5"
          style={{ boxShadow: value.back === b.k ? ON : OFF }}
        >
          <div className="size-full rounded-[2px]" style={{ background: backPattern(b.c) }} />
        </button>
      ))}
    </div>
  )
}

export function FxSegment({
  value,
  onChange,
  labels,
  full
}: {
  value: AppearanceValue
  onChange(value: AppearanceValue): void
  labels: Record<Fx, string>
  full?: boolean
}) {
  return (
    <Segmented<Fx>
      full={full}
      value={value.fx}
      options={[
        { label: labels.full, value: 'full' },
        { label: labels.lite, value: 'lite' },
        { label: labels.off, value: 'off' }
      ]}
      onChange={(fx) => onChange({ ...value, fx })}
    />
  )
}

export function AppearancePopover({
  value,
  onChange,
  labels
}: {
  value: AppearanceValue
  onChange(value: AppearanceValue): void
  labels: AppearanceLabels
}) {
  return (
    <div className="box-border flex w-[250px] flex-col gap-3.5 rounded-[14px] border bg-white px-4 py-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.14)]">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{labels.felt}</span>
        <FeltSwatches value={value} onChange={onChange} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{labels.back}</span>
        <BackSwatches value={value} onChange={onChange} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{labels.fx}</span>
        <FxSegment value={value} onChange={onChange} labels={labels.fxOpts} full />
      </div>
    </div>
  )
}
