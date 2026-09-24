const { PokerEngine } = require('@pokertools/engine')
const mk = (seed) => { let x = seed; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648 }
// 单挑：按钮=小盲，翻前先行动，翻后后行动
const e = new PokerEngine({ smallBlind: 10, bigBlind: 20, randomProvider: mk(3) })
e.sit(0, 'a', 'a', 1000); e.sit(1, 'b', 'b', 1000); e.deal()
let s = e.state
console.log('HU button', s.buttonSeat, 'bets', [...s.currentBets], 'first to act', s.actionTo, 'hand', s.players[0].hand)
e.act({ type: 'CALL', playerId: s.players[s.actionTo].id }); s = e.state
e.act({ type: 'CHECK', playerId: s.players[s.actionTo].id }); s = e.state
console.log('flop', s.street, s.board, 'first to act postflop', s.actionTo)
// 全下 runout
const f = new PokerEngine({ smallBlind: 10, bigBlind: 20, randomProvider: mk(5) })
f.sit(0, 'a', 'a', 500); f.sit(1, 'b', 'b', 500); f.sit(2, 'c', 'c', 500); f.deal(); s = f.state
f.act({ type: 'RAISE', playerId: s.players[s.actionTo].id, amount: 500 }); s = f.state
f.act({ type: 'CALL', playerId: s.players[s.actionTo].id }); s = f.state
f.act({ type: 'FOLD', playerId: s.players[s.actionTo].id }); s = f.state
console.log('after all-in call: street', s.street, 'board', s.board, 'winners', JSON.stringify(s.winners), 'actionTo', s.actionTo)
console.log('history types', s.actionHistory.map((r) => r.action.type + (r.street ? '@' + r.street : '')).join(' '))
// 弃牌赢
const g = new PokerEngine({ smallBlind: 10, bigBlind: 20, randomProvider: mk(9) })
g.sit(0, 'a', 'a', 500); g.sit(1, 'b', 'b', 500); g.sit(2, 'c', 'c', 500); g.deal(); s = g.state
g.act({ type: 'FOLD', playerId: s.players[s.actionTo].id }); s = g.state
g.act({ type: 'FOLD', playerId: s.players[s.actionTo].id }); s = g.state
console.log('fold win', JSON.stringify(s.winners), 'uncalled?', s.actionHistory.map((r) => r.action.type).join(' '), 'stacks', s.players.filter(Boolean).map((p) => p.stack))
// 确定性
const h = (seed) => { const q = new PokerEngine({ smallBlind: 10, bigBlind: 20, randomProvider: mk(seed) }); q.sit(0, 'a', 'a', 500); q.sit(1, 'b', 'b', 500); q.deal(); return JSON.stringify(q.state.players.map((p) => p.hand)) + q.state.buttonSeat }
console.log('deterministic', h(11) === h(11), h(11) !== h(12))
console.log('view masking', JSON.stringify(g.view('a').players.map((p) => p && p.hand)))
