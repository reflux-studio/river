export const promptZh = {
  coaches: [
    { n: '温和老师', s: '语气温和耐心，多鼓励，用生活化的比喻解释。' },
    { n: '直白教练', s: '一针见血：先给结论，再用一两句理由。' },
    { n: '数据派', s: '以数字说话：给出胜率、底池赔率、期望值的简单计算。' }
  ]
}

export const promptEn: typeof promptZh = {
  coaches: [
    { n: 'Gentle teacher', s: 'Warm and patient, encouraging, explains with everyday analogies.' },
    { n: 'Blunt coach', s: 'Straight to the point: conclusion first, then one or two reasons.' },
    { n: 'Numbers', s: 'Lets the numbers talk: gives simple equity, pot odds and EV calculations.' }
  ]
}
