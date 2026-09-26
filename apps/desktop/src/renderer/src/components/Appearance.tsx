import { BACKS, backPattern, FELTS, RAINBOW } from '@river/ui'
import { useEffect, useState } from 'react'
import { Segmented } from '@/components/Segmented'
import { updateSettings, useRiver, useT } from '@/lib/river'
import type { Fx } from '../../../shared/types'

const ON = '0 0 0 2px #fff, 0 0 0 4px #1d1d1f'
const OFF = '0 0 0 1px rgba(0,0,0,0.14)'

// 拖动取色时每帧都会触发 change：合并成一次写入
let colorTimer: ReturnType<typeof setTimeout> | undefined
const pickColor = (c: string) => {
  clearTimeout(colorTimer)
  colorTimer = setTimeout(() => void updateSettings({ felt: 'custom', feltCustom: c }), 150)
}

export function FeltSwatches({ size = 26 }: { size?: number }) {
  const felt = useRiver((s) => s.settings.felt)
  const saved = useRiver((s) => s.settings.feltCustom)
  const [draft, setDraft] = useState<string | null>(null)
  const t = useT()
  const custom = draft ?? saved
  useEffect(() => setDraft(null), [saved])
  return (
    <div className="flex flex-wrap gap-2">
      {FELTS.map((f) => (
        <button key={f.k} title={t.common.felt[f.k]} onClick={() => updateSettings({ felt: f.k })} className="rounded-full" style={{ width: size, height: size, background: f.felt, boxShadow: felt === f.k ? ON : OFF }} />
      ))}
      <label title={t.desktop.appearance.custom} className="relative block cursor-pointer rounded-full" style={{ width: size, height: size, background: felt === 'custom' ? custom : RAINBOW, boxShadow: felt === 'custom' ? ON : OFF }}>
        <input
          type="color"
          value={custom}
          onChange={(e) => (setDraft(e.target.value), pickColor(e.target.value))}
          className="absolute inset-0 size-full cursor-pointer border-0 p-0 opacity-0"
        />
      </label>
    </div>
  )
}

export function BackSwatches() {
  const back = useRiver((s) => s.settings.back)
  return (
    <div className="flex gap-2">
      {BACKS.map((b) => (
        <button key={b.k} onClick={() => updateSettings({ back: b.k })} className="box-border h-7 w-5 rounded bg-white p-0.5" style={{ boxShadow: back === b.k ? ON : OFF }}>
          <div className="size-full rounded-[2px]" style={{ background: backPattern(b.c) }} />
        </button>
      ))}
    </div>
  )
}

export function FxSegment({ full }: { full?: boolean }) {
  const fx = useRiver((s) => s.settings.fx)
  const o = useT().desktop.appearance.fxOpts
  return (
    <Segmented<Fx>
      full={full}
      value={fx}
      options={[{ label: o.full, value: 'full' }, { label: o.lite, value: 'lite' }, { label: o.off, value: 'off' }]}
      onChange={(v) => updateSettings({ fx: v })}
    />
  )
}

// 牌桌右上角的“桌面外观”浮层
export function AppearancePopover() {
  const a = useT().desktop.appearance
  return (
    <div className="box-border flex w-[250px] flex-col gap-3.5 rounded-[14px] border bg-white px-4 py-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.14)]">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{a.felt}</span>
        <FeltSwatches />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{a.back}</span>
        <BackSwatches />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{a.fx}</span>
        <FxSegment full />
      </div>
    </div>
  )
}
