import { useEffect, useRef, useState } from 'react'
import {
  AppearancePopover as BasePopover,
  BackSwatches as BaseBackSwatches,
  FeltSwatches as BaseFeltSwatches,
  FxSegment as BaseFxSegment,
  type AppearanceValue
} from '@river/ui'
import { updateSettings, useRiver, useT } from '@/lib/river'
import type { Settings as SettingsT } from '../../../shared/types'

const valueOf = (s: SettingsT): AppearanceValue => ({
  felt: s.felt,
  feltCustom: s.feltCustom,
  back: s.back,
  fx: s.fx
})

// 取色拖动会连续触发 change：界面先走本地草稿，写入合并成一次
function useDraft() {
  const settings = useRiver((s) => s.settings)
  const [draft, setDraft] = useState<AppearanceValue | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    setDraft(null)
  }, [settings.felt, settings.feltCustom, settings.back, settings.fx])
  useEffect(() => () => clearTimeout(timer.current), [])
  const change = (value: AppearanceValue) => {
    setDraft(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void updateSettings(value), 150)
  }
  return [draft ?? valueOf(settings), change] as const
}

export function FeltSwatches({ size = 26 }: { size?: number }) {
  const [value, onChange] = useDraft()
  return <BaseFeltSwatches value={value} onChange={onChange} size={size} />
}

export function BackSwatches() {
  const [value, onChange] = useDraft()
  return <BaseBackSwatches value={value} onChange={onChange} />
}

export function FxSegment({ full }: { full?: boolean }) {
  const [value, onChange] = useDraft()
  const o = useT().desktop.appearance.fxOpts
  return <BaseFxSegment value={value} onChange={onChange} labels={o} full={full} />
}

// 牌桌右上角的“桌面外观”浮层
export function AppearancePopover() {
  const [value, onChange] = useDraft()
  const a = useT().desktop.appearance
  return (
    <BasePopover
      value={value}
      onChange={onChange}
      labels={{ felt: a.felt, back: a.back, fx: a.fx, custom: a.custom, fxOpts: a.fxOpts }}
    />
  )
}
