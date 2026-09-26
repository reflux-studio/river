export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))
