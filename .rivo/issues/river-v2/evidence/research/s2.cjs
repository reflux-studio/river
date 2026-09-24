const { Table } = require('poker-ts')
for (let btn = 0; btn < 3; btn++) {
  const t = new Table({ smallBlind: 10, bigBlind: 20 }, 3)
  t.sitDown(0, 1000); t.sitDown(1, 1000); t.sitDown(2, 1000)
  // 让 BB 为短码：先试 button
  t.startHand(btn)
  const first = t.playerToAct()
  // BB = 第三个行动者
  const bb = (btn + 2) % 3
  if (bb !== 2) continue
  const t2 = new Table({ smallBlind: 10, bigBlind: 20 }, 3)
  t2.sitDown(0, 1000); t2.sitDown(1, 1000); t2.sitDown(2, 150)
  t2.startHand(btn)
  t2.actionTaken('raise', 100)
  t2.actionTaken('call')
  const short = t2.playerToAct()
  const la = t2.legalActions()
  t2.actionTaken('raise', la.chipRange.max)
  const who = t2.playerToAct()
  console.log('poker-ts after incomplete all-in: seat', who, 'legal', JSON.stringify(t2.legalActions()))
}
