import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

// 设计稿的分段控件：浅灰底槽，选中项白底加阴影
export function Segmented<T extends string | number>({
  value, options, onChange, disabled, full
}: {
  value: T
  options: { label: string; value: T; disabled?: boolean }[]
  onChange: (v: T) => void
  disabled?: boolean
  full?: boolean
}) {
  return (
    <ToggleGroup
      type="single"
      value={String(value)}
      disabled={disabled}
      // 再次点击已选项时 Radix 会给出空值，分段控件不允许取消选择
      onValueChange={(v) => {
        const o = options.find((x) => String(x.value) === v)
        if (o) onChange(o.value)
      }}
      className={cn('gap-0 rounded-[9px] bg-muted p-[3px]', full && 'flex w-full')}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={String(o.value)}
          value={String(o.value)}
          disabled={o.disabled}
          className={cn(
            'h-auto min-w-0 rounded-[7px] px-3.5 py-[5px] text-[13px] font-normal hover:bg-transparent data-[state=on]:bg-white data-[state=on]:font-semibold data-[state=on]:shadow-[0_1px_2px_rgba(0,0,0,0.08)]',
            full && 'flex-1'
          )}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
