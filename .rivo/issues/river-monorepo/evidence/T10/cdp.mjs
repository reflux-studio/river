// usage: node cdp.mjs eval "<js>" | node cdp.mjs shot <file>
const [,, mode, arg] = process.argv
const list = await (await fetch('http://localhost:9333/json/list')).json()
const ws = new WebSocket(list.find((p) => p.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const send = (method, params) => new Promise((res) => {
  const my = ++id
  ws.addEventListener('message', function h(e) { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', h); res(m) } })
  ws.send(JSON.stringify({ id: my, method, params }))
})
if (mode === 'eval') {
  const r = await send('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true })
  console.log(JSON.stringify(r.result.result?.value ?? r.result, null, 1))
} else {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(arg, Buffer.from(r.result.data, 'base64'))
  console.log('saved', arg)
}
ws.close()
