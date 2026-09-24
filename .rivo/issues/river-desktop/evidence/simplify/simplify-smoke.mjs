// UI 冒烟：大厅→入座→打 2 手（中途重载页面验证恢复）→离桌→回放→统计→设置。
// usage: PORT=9555 OUT=<dir> node simplify-smoke.mjs
import fs from 'node:fs'
const port = process.env.PORT || 9555
const out = process.env.OUT
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
const errors = []
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id) return pending.get(m.id)?.(m)
  if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
    errors.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description).join(' '))
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text)
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + ' → ' + r.result.exceptionDetails.exception?.description)
  return r.result.result.value
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, 'base64'))
}
// 按可见文字点击按钮
const click = (text) => ev(`(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(text)}) && !x.disabled)
  if (!b) return false
  b.click(); return true
})()`)
const text = () => ev('document.body.innerText')
const until = async (pred, ms = 15000) => {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(150)) if (await pred()) return true
  throw new Error('timeout waiting')
}
const installSpy = () => ev(`(() => { window.__views = []; window.river.on('table:view', (v) => window.__views.push(v)); return true })()`)
// 重载后到下一次推送前监听器里没有视图，退回 bootstrap 快照（只读）
const lastView = () => ev(`(async () => window.__views.at(-1) ?? (await window.river.invoke('app.bootstrap')).view)()`)

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
const log = []

// 设置：本地引擎
await click('设置')
await until(async () => (await text()).includes('本地引擎'))
await click('本地引擎')
await sleep(200)
log.push({ step: 'settings', ok: (await text()).includes('本地引擎') })

// 大厅 → 新手桌 → 入座
await click('大厅')
await until(async () => (await text()).includes('新手桌'))
await click('新手桌')
await sleep(200)
await installSpy()
await click('入座')
await until(async () => !!(await lastView()))
await until(async () => (await text()).includes('底池'))
await shot('01-table')
log.push({ step: 'seated', title: (await lastView()).title })

// 打 2 手：轮到就跟注/过牌，一手结束点“下一手”
const played = new Set()
let reloaded = null
for (let i = 0; i < 400 && played.size < 2; i++) {
  const v = await lastView()
  if (v?.done) {
    played.add(v.handNo)
    if (played.size >= 2) break
    await click('下一手')
    await sleep(300)
    continue
  }
  if (v?.hero.isTurn && !v.paused) {
    // 第 1 手第一次轮到时重载页面：视图应从 bootstrap 恢复
    if (!reloaded && v.handNo === 1) {
      await ev('location.reload()')
      await sleep(1500)
      await until(async () => (await text()).includes('回到牌桌'))
      const navHasTable = await ev(`[...document.querySelectorAll('nav button')].some((b) => b.innerText.includes('牌桌'))`)
      await click('回到牌桌')
      await until(async () => (await text()).includes('底池'))
      await installSpy()
      reloaded = { navHasTable, restoredActionBar: (await text()).match(/(跟注|过牌)/)?.[0] ?? null }
      await shot('02-after-reload')
      continue
    }
    await (v.hero.toCall > 0 ? click('跟注') : click('过牌'))
    await sleep(250)
    continue
  }
  await sleep(250)
}
await shot('03-hand-done')
log.push({ step: 'played', hands: [...played], reloaded })

// 离桌
await click('离桌')
await until(async () => (await text()).includes('新手桌'))
const hasTableTab = await ev(`[...document.querySelectorAll('nav button')].some((b) => b.innerText.includes('牌桌'))`)
log.push({ step: 'left', hasTableTab })

// 回放
await click('手牌回放')
await until(async () => (await text()).includes('手牌回放') && /#\d+/.test(await text()))
await sleep(400)
await shot('04-replays')
log.push({ step: 'replays', head: (await text()).split('\n').slice(0, 20).join(' | ') })

// 统计
await click('数据统计')
await until(async () => (await text()).includes('VPIP'))
await sleep(300)
await shot('05-stats')
log.push({ step: 'stats', kpi: (await text()).match(/已打手数\n(\d+)/)?.[1], vpip: (await text()).match(/VPIP 入池率\n([^\n]+)/)?.[1], pfr: (await text()).match(/PFR 翻前加注\n([^\n]+)/)?.[1] })

// 设置
await click('设置')
await until(async () => (await text()).includes('本桌托管次数'))
await shot('06-settings')
log.push({ step: 'settings-page', autopilot: (await text()).match(/本桌托管次数[^\n]*\n[^\n]*\n([^\n]+)/)?.[1] })

// 还原引擎设置，避免影响后续使用
await ev(`window.river.invoke('settings.update', { engine: 'llm' })`)
log.push({ errors })
console.log(JSON.stringify(log, null, 1))
fs.writeFileSync(`${out}/smoke.json`, JSON.stringify(log, null, 1))
ws.close()
