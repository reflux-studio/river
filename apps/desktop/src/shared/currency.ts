// 花费显示可选的货币。价格源 models.dev 是美元；汇率来自 fawazahmed0/exchange-api（以美元为基准，币种代码小写）
// approx 只在从未拉到汇率时兜底；显示名称与单位在 @river/i18n 的 common 里
export const CURRENCIES = [
  { code: 'cny', symbol: '¥', approx: 7.1 },
  { code: 'usd', symbol: '$', approx: 1 },
  { code: 'hkd', symbol: 'HK$', approx: 7.8 },
  { code: 'twd', symbol: 'NT$', approx: 32 },
  { code: 'eur', symbol: '€', approx: 0.92 },
  { code: 'gbp', symbol: '£', approx: 0.78 },
  { code: 'jpy', symbol: 'JP¥', approx: 150 },
  { code: 'krw', symbol: '₩', approx: 1380 },
  { code: 'sgd', symbol: 'S$', approx: 1.34 }
] as const

export type Currency = (typeof CURRENCIES)[number]['code']

export const currencyOf = (code: string) => CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]
