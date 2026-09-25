// 花费显示可选的货币。价格源 models.dev 是美元；汇率来自 fawazahmed0/exchange-api（以美元为基准，币种代码小写）
// approx 只在从未拉到汇率时兜底
export const CURRENCIES = [
  { code: 'cny', name: '人民币', unit: '元', symbol: '¥', approx: 7.1 },
  { code: 'usd', name: '美元', unit: '美元', symbol: '$', approx: 1 },
  { code: 'hkd', name: '港币', unit: '港元', symbol: 'HK$', approx: 7.8 },
  { code: 'twd', name: '新台币', unit: '新台币', symbol: 'NT$', approx: 32 },
  { code: 'eur', name: '欧元', unit: '欧元', symbol: '€', approx: 0.92 },
  { code: 'gbp', name: '英镑', unit: '英镑', symbol: '£', approx: 0.78 },
  { code: 'jpy', name: '日元', unit: '日元', symbol: 'JP¥', approx: 150 },
  { code: 'krw', name: '韩元', unit: '韩元', symbol: '₩', approx: 1380 },
  { code: 'sgd', name: '新加坡元', unit: '新加坡元', symbol: 'S$', approx: 1.34 }
] as const

export type Currency = (typeof CURRENCIES)[number]['code']

export const currencyOf = (code: string) => CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]
