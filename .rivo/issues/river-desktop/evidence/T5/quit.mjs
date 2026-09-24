// 有桌时关闭窗口 → window-all-closed → app.quit → before-quit 拦截并离桌结算
const list = await (await fetch('http://127.0.0.1:9333/json')).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m) }
const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const r = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const R = window.river, views = []
  R.on('table:view', (v) => views.push(v))
  const prev = (await R.invoke('app.bootstrap')).settings
  await R.invoke('settings.update', { engine: 'local', speed: 2, autoNext: false })
  const before = (await R.invoke('app.bootstrap')).bankroll
  await R.invoke('table.start', { size: 2, blinds: 1, picks: ['k'], guided: false })
  await new Promise((r) => setTimeout(r, 1500))
  const heroStack = views.at(-1).seats[0].stack
  await R.invoke('settings.update', { engine: prev.engine, speed: prev.speed, autoNext: prev.autoNext })
  setTimeout(() => window.close(), 50)
  return { before, buyIn: 10000, heroStack, expected: before - 10000 + heroStack }
})()` })
console.log(JSON.stringify(r.result.result.value))
