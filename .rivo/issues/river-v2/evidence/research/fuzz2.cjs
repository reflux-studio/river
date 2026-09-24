const { PokerEngine } = require('@pokertools/engine')
let x = 7; const rng = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648
let hands = 0, stuck = {}, bad = 0, badEx = null, ok = 0
const sum = (s) => s.players.reduce((a, p) => a + (p ? p.stack : 0), 0)
for (let table = 0; table < 3000; table++) {
  const n = 2 + (table % 5)
  const e = new PokerEngine({ smallBlind: 10, bigBlind: 20, randomProvider: rng })
  for (let i = 0; i < n; i++) e.sit(i, 'p' + i, 'p' + i, 200 + ((rng() * 3000) | 0))
  const total = sum(e.state)
  for (let h = 0; h < 20; h++) {
    if (e.state.players.filter((p) => p && p.stack > 0).length < 2) break
    e.deal(); hands++
    let guard = 0
    while (e.state.actionTo !== null && guard++ < 200) {
      const s = e.state, seat = s.actionTo, p = s.players[seat]
      const cur = Math.max(...[...s.currentBets.values()], 0), mine = s.currentBets.get(seat) || 0
      const r = rng(); let a
      if (r < 0.15) a = { type: 'FOLD' }
      else if (r < 0.6) a = cur > mine ? { type: 'CALL' } : { type: 'CHECK' }
      else { const minTo = cur + s.minRaise, maxTo = mine + p.stack; a = { type: cur === 0 ? 'BET' : 'RAISE', amount: Math.min(maxTo, minTo + ((rng() * 400) | 0)) } }
      a.playerId = p.id
      if (!e.validate(a).valid) { a = cur > mine ? { type: 'CALL', playerId: p.id } : { type: 'CHECK', playerId: p.id }; if (!e.validate(a).valid) a = { type: 'FOLD', playerId: p.id } }
      e.act(a)
    }
    const s = e.state
    const key = `street=${s.street} winners=${!!s.winners} actionTo=${s.actionTo} board=${s.board.length}`
    if (!s.winners) { stuck[key] = (stuck[key] || 0) + 1; if (!stuck.ex) stuck.ex = { hist: s.actionHistory.slice(-6).map((r) => r.action.type + ':' + (r.action.amount || '')), players: s.players.filter(Boolean).map((p) => [p.status, p.stack, p.betThisStreet]) }; break }
    const t = sum(s)
    if (t !== total) { bad++; if (!badEx) badEx = { total, t, pots: s.pots, winners: s.winners, players: s.players.filter(Boolean).map((p) => [p.status, p.stack, p.totalInvestedThisHand]) } } else ok++
  }
}
console.log(JSON.stringify({ hands, ok, bad, stuck, badEx }, null, 1).slice(0, 3000))
