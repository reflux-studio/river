// 通过 CDP 在 Renderer 中调用 window.river，验证 preload → IPC → TableRunner 通路
const list = await (await fetch('http://127.0.0.1:9333/json')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id) }
const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const expr = `(async () => {
  const R = window.river, log = []
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const views = [], chat = [], bankroll = []
  R.on('table:view', (v) => views.push(v)); R.on('chat:append', (m) => chat.push(m)); R.on('bankroll', (b) => bankroll.push(b))
  const boot = await R.invoke('app.bootstrap')
  log.push({ step: 'bootstrap', keys: Object.keys(boot), bankroll: boot.bankroll, hasTable: boot.hasTable, providers: boot.providers.length, personas: boot.personas.length, engine: boot.settings.engine })
  const prev = { engine: boot.settings.engine, speed: boot.settings.speed, autoNext: boot.settings.autoNext }
  await R.invoke('settings.update', { engine: 'local', speed: 2, autoNext: false })
  await R.invoke('table.start', { size: 3, blinds: 0, picks: ['li', 'bai'], guided: false })
  const acted = []
  for (let i = 0; i < 150 && acted.length < 3; i++) {
    const v = views.at(-1)
    if (v && v.done) { await R.invoke('table.nextHand'); await sleep(300); continue }
    if (v && v.hero.isTurn && !v.paused) { const t = v.hero.toCall > 0 ? 'call' : 'call'; await R.invoke('table.heroAct', { type: t }); acted.push({ hand: v.handNo, street: v.street, toCall: v.hero.toCall }); await sleep(100); continue }
    await sleep(200)
  }
  const last = views.at(-1)
  const oppCards = last.seats.filter((s) => s.personaId && s.cards).length
  log.push({ step: 'played', acted, views: views.length, chat: chat.length, lastTitle: last.title, handNo: last.handNo, oppCardsShown: oppCards, street: last.street, sampleChat: chat.slice(0, 6).map((m) => [m.kind, m.from, m.act, m.text]) })
  await R.invoke('table.leave')
  await R.invoke('settings.update', prev)
  const boot2 = await R.invoke('app.bootstrap')
  const hands = await R.invoke('hands.list')
  log.push({ step: 'left', hasTable: boot2.hasTable, bankrollEvents: bankroll, bankroll: boot2.bankroll, handsTotal: hands.length, engineRestored: boot2.settings.engine })
  return log
})()`
const res = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
console.log(JSON.stringify(res.result?.result?.value ?? res, null, 1))
ws.close()
