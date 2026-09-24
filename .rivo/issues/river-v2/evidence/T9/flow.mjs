// 真实应用验收：教练局 6 人（锁定 → 讲解 → 行动 → 一手结束亮牌 → 复盘卡 → 下一手）、提问暂停、模型故障停下与重试、
// 停下离桌作废、自由局 2 人、对手编辑、回放、统计、设置。需先启动 mock-llm.mjs 与应用（见 record.md）。
import fs from 'node:fs'
import { connect } from './cdp.mjs'
const out = process.env.OUT
const c = await connect()
const log = []
const step = (name, data = {}) => (log.push({ name, ...data }), console.log(name, JSON.stringify(data)))
await c.size(1440, 900)

const heroTurn = async () => {
  const v = await c.view()
  return v && v.hero.isTurn && !v.coach?.locked && !v.stalled
}
const act = async (type) => c.invoke('table.heroAct', type === 'raise' ? { type, to: (await c.view()).hero.defaultRaiseTo } : { type })
async function playToEnd(pick = () => 'call') {
  for (let i = 0; i < 600; i++) {
    const v = await c.view()
    if (v.done) return v
    if (await heroTurn()) await act(pick(v))
    await c.sleep(250)
  }
  throw new Error('hand did not end')
}

// 1 教练局 6 人
await c.click('大厅')
await c.click('常规桌')
await c.click('教练局')
await c.click('入座')
await c.until(async () => (await c.view())?.hero.isTurn, 60000)
const locked = (await c.view()).coach
step('coach-hero-turn', { coach: locked })
await c.until(heroTurn, 30000)
await c.shot(`${out}/01-coach-turn.png`)
let v = await playToEnd()
await c.sleep(400)
await c.shot(`${out}/02-coach-hand-end.png`)
step('coach-hand-end', { mucked: v.seats.filter((s) => s.mucked).length, revealed: v.seats.filter((s) => s.cards).length, canNext: v.coach.canNext })
await c.until(async () => (await c.view()).coach.canNext, 30000)
await c.sleep(300)
await c.shot(`${out}/03-recap-card.png`)
step('recap-done', { thread: (await c.ev(`window.river.invoke('app.bootstrap').then((b) => b.coachThread.map((e) => e.kind + ':' + e.status))`)) })

// 2 提问暂停
await c.click('下一手')
await c.until(async () => (await c.view()).seats.some((s) => s.thinking), 30000)
await c.ev(`window.river.invoke('coach.ask', '什么是底池赔率？')`)
const len0 = (await c.view()).seats.map((s) => s.status).join()
await c.sleep(800)
await c.shot(`${out}/04-ask-paused.png`)
step('ask', { busy: (await c.view()).coach.busy })
await c.until(async () => (await c.view()).coach.busy !== 'ask', 30000)
void len0
v = await playToEnd()
await c.until(async () => (await c.view()).coach.canNext, 30000)

// 3 模型故障：停下、重试
await fetch('http://127.0.0.1:8787/__fail', { method: 'POST', body: '1' })
await c.click('下一手')
await c.until(async () => !!(await c.view()).stalled, 60000)
await c.sleep(300)
await c.shot(`${out}/05-stalled.png`)
step('stalled', { stalled: (await c.view()).stalled })
await fetch('http://127.0.0.1:8787/__fail', { method: 'POST', body: '0' })
await c.click('重试')
await c.until(async () => !(await c.view()).stalled, 30000)
step('retried', { stalled: (await c.view()).stalled })
v = await playToEnd()
await c.until(async () => (await c.view()).coach.canNext, 30000)

// 4 停下时离桌：本手作废
await fetch('http://127.0.0.1:8787/__fail', { method: 'POST', body: '1' })
await c.click('下一手')
await c.until(async () => !!(await c.view()).stalled, 60000)
const bankBefore = await c.ev(`window.river.invoke('app.bootstrap').then((b) => b.bankroll)`)
const stackAtStart = (await c.view()).seats[0].stack + (await c.view()).seats[0].bet
await c.click('离桌')
await c.sleep(800)
const bankAfter = await c.ev(`window.river.invoke('app.bootstrap').then((b) => b.bankroll)`)
step('leave-stalled', { bankBefore, bankAfter, stackAtStart })
await fetch('http://127.0.0.1:8787/__fail', { method: 'POST', body: '0' })

// 5 自由局单挑
await c.click('单挑')
await c.click('自由局')
await c.click('入座')
await c.until(async () => !!(await c.view()), 30000)
await c.until(heroTurn, 60000)
await c.shot(`${out}/06-free-2p.png`)
v = await playToEnd()
await c.sleep(1200)
await c.shot(`${out}/07-free-hand-end.png`)
step('free-hand-end', { coach: v.coach, oppCards: v.seats.slice(1).filter((s) => s.cards).length, street: v.street })
// 桌面外观：换桌布与牌背
await c.click('桌面外观')
await c.sleep(200)
await c.ev(`document.querySelector('button[title="深海蓝"]').click()`)
await c.sleep(300)
await c.shot(`${out}/08-appearance.png`)
await c.click('桌面外观')
await c.click('离桌')
await c.sleep(600)

// 6 对手页：新建并编辑
await c.click('AI 对手')
await c.sleep(300)
await c.click('＋ 新建对手')
await c.sleep(500)
await c.shot(`${out}/09-opponent-new.png`)
await c.click('完成')
await c.sleep(300)

// 7 回放、统计、设置
await c.click('手牌回放')
await c.sleep(1200)
await c.shot(`${out}/10-replays.png`)
await c.click('数据统计')
await c.sleep(1200)
await c.ev(`document.querySelector('main .overflow-auto')?.scrollTo(0, 99999)`)
await c.sleep(300)
await c.shot(`${out}/11-stats-usage.png`)
await c.click('设置')
await c.sleep(600)
await c.shot(`${out}/12-settings.png`)
await c.ev(`document.querySelector('main .overflow-auto')?.scrollTo(0, 99999)`)
await c.sleep(300)
await c.shot(`${out}/13-settings-bottom.png`)
step('errors', { errors: c.errors })
fs.writeFileSync(`${out}/flow.json`, JSON.stringify(log, null, 2))
process.exit(0)
