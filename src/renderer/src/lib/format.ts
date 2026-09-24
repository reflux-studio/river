export { cardsText, disp, fmt, signed } from '../../../shared/format'

export const netColor = (n: number) => (n > 0 ? 'text-win' : n < 0 ? 'text-lose' : 'text-muted-foreground')
export const avatarBg = (hue?: number) => (hue === undefined ? 'oklch(0.9 0.045 255)' : `oklch(0.91 0.045 ${hue})`)
