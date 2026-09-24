import { newGame, startHand, apply, legal } from '/home/user/river/src/main/engine/poker'
for (let d = 0; d < 20; d++) {
  let x = d + 1; const rng = () => (x = (x * 9301 + 49297) % 233280) / 233280
  const g = newGame({ sb: 10, bb: 20, players: [0, 1, 2].map((i) => ({ id: 'p' + i, name: 'p' + i, isHero: i === 0, stack: 1000 })) }, rng)
  startHand(g)
  if (g.bbI !== 2) continue
  // 把 BB 调成短码：已下 20，剩余 130
  g.players[2].stack = 130
  apply(g, g.toAct, { type: 'raise', to: 100 })
  apply(g, g.toAct, { type: 'call' })
  apply(g, g.toAct, { type: 'raise', to: 150 })
  console.log('river engine: seat', g.toAct, 'legal', JSON.stringify(legal(g, g.toAct)))
  break
}
