import type { Street } from '@river/engine'

export const pokerZh = {
  street: { preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌', showdown: '摊牌' } satisfies Record<Street, string>,
  hand: {
    highCard: '高牌', pair: '一对', twoPair: '两对', trips: '三条', straight: '顺子', flush: '同花', fullHouse: '葫芦',
    quads: '四条', straightFlush: '同花顺', royalFlush: '皇家同花顺', pocketPair: '口袋对子', suitedHole: '同花底牌'
  },
  act: { blind: '盲注', fold: '弃牌', check: '过牌', call: '跟注', bet: '下注', raise: '加注', raiseTo: '加注至', allin: '全下' },
  pos: { btn: '按钮', btnSb: '按钮/小盲', sb: '小盲', bb: '大盲', utg: '枪口', mp: '中位', co: '关煞' },
  pot: '底池'
}

export const pokerEn: typeof pokerZh = {
  street: { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' },
  hand: {
    highCard: 'High card', pair: 'One pair', twoPair: 'Two pair', trips: 'Three of a kind', straight: 'Straight', flush: 'Flush', fullHouse: 'Full house',
    quads: 'Four of a kind', straightFlush: 'Straight flush', royalFlush: 'Royal flush', pocketPair: 'Pocket pair', suitedHole: 'Suited hole cards'
  },
  act: { blind: 'Blinds', fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', raiseTo: 'Raise to', allin: 'All-in' },
  pos: { btn: 'BTN', btnSb: 'BTN/SB', sb: 'SB', bb: 'BB', utg: 'UTG', mp: 'MP', co: 'CO' },
  pot: 'Pot'
}
