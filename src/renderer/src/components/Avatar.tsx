import { avatarBg } from '@/lib/format'
import { cn } from '@/lib/utils'

// hue 省略即玩家本人的蓝色
export function Avatar({ ini, hue, size = 26, className }: { ini: string; hue?: number; size?: number; className?: string }) {
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-foreground', className)}
      style={{ width: size, height: size, background: avatarBg(hue), fontSize: Math.round(size * 0.4) }}
    >
      {ini}
    </span>
  )
}
