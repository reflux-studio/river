// 场景：3 人，盲注 10/20。翻前第一个行动者加注到 100，第二个跟 100，第三个（短码 150）全下 150（增量 50 < 最小加注 80，不完整加注）。
// 规则：已行动过的前两位不能再加注，只能跟或弃。
const { PokerEngine } = require('@pokertools/engine')
const Poker = require('poker-ts').default
function pt() {
  for (let t = 0; t < 30; t++) {
    const e = new PokerEngine({ smallBlind: 10, bigBlind: 20 })
    e.sit(0, 'a', 'a', 1000); e.sit(1, 'b', 'b', 1000); e.sit(2, 'c', 'c', 1000)
    e.deal()
    let s = e.state
    const order = []
    let seat = s.actionTo
    // 第三个行动者需是短码：重新开一桌，把 stack 调整
    const first = seat
    const e2 = new PokerEngine({ smallBlind: 10, bigBlind: 20, randomProvider: () => 0.3 })
    // 直接用 e：第三个行动者 = BB
    const id = (x) => s.players[x].id
    e.act({ type: 'RAISE', playerId: id(s.actionTo), amount: 100 }); s = e.state
    e.act({ type: 'CALL', playerId: id(s.actionTo) }); s = e.state
    const third = s.actionTo
    return { e, id, third }
  }
}
// pokertools：用 ADD_CHIPS 做不到减少筹码，改为直接构造：座位 stack 按 BB 位置重排
function runPT() {
  for (let t = 0; t < 50; t++) {
    const probe = new PokerEngine({ smallBlind: 10, bigBlind: 20, randomProvider: (() => { let x = t + 1; return () => (x = (x * 9301 + 49297) % 233280) / 233280 })() })
    probe.sit(0, 'a', 'a', 1000); probe.sit(1, 'b', 'b', 1000); probe.sit(2, 'c', 'c', 150)
    probe.deal()
    let s = probe.state
    const id = (x) => s.players[x].id
    const firstSeat = s.actionTo
    if (s.players[firstSeat].stack < 500) continue
    probe.act({ type: 'RAISE', playerId: id(s.actionTo), amount: 100 }); s = probe.state
    if (s.players[s.actionTo].stack < 500) continue
    probe.act({ type: 'CALL', playerId: id(s.actionTo) }); s = probe.state
    const short = s.actionTo
    probe.act({ type: 'RAISE', playerId: id(short), amount: s.players[short].stack + s.players[short].betThisStreet }); s = probe.state
    const who = s.actionTo
    const v = probe.validate({ type: 'RAISE', playerId: id(who), amount: 400 })
    console.log('pokertools: after incomplete all-in, seat', who, 'can re-raise?', v)
    return
  }
  console.log('pokertools: no config')
}
runPT()
function runPoker() {
  const t = new Poker({ smallBlind: 10, bigBlind: 20 }, 3)
  t.sitDown(0, 1000); t.sitDown(1, 1000); t.sitDown(2, 1000)
  t.startHand()
  // 找到 BB 座位，把它换成短码：重新开
  const bb = t.playerToAct() // UTG = button in 3-handed
  const t2 = new Poker({ smallBlind: 10, bigBlind: 20 }, 3)
  for (let i = 0; i < 3; i++) t2.sitDown(i, 1000)
  t2.startHand(0)
  let s = t2.playerToAct()
  console.log('poker-ts first to act', s, 'button', t2.button())
}
try { runPoker() } catch (e) { console.log('poker-ts err', e.message) }
