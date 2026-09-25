// node cdp.mjs <port> eval '<js>'   |   node cdp.mjs <port> shot <out.png> [w h]
import { writeFileSync } from 'node:fs'
const [port, cmd, arg, w, h] = process.argv.slice(2)
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const call = (method, params = {}) =>
  new Promise((res, rej) => {
    const my = ++id
    const on = (e) => {
      const m = JSON.parse(e.data)
      if (m.id !== my) return
      ws.removeEventListener('message', on)
      m.error ? rej(new Error(m.error.message)) : res(m.result)
    }
    ws.addEventListener('message', on)
    ws.send(JSON.stringify({ id: my, method, params }))
  })
if (cmd === 'eval') {
  const r = await call('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true })
  console.log(JSON.stringify(r.result.value ?? r.exceptionDetails ?? r.result, null, 1))
} else if (cmd === 'shot') {
  if (w) await call('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 2, mobile: false })
  const r = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(arg, Buffer.from(r.data, 'base64'))
  console.log('saved', arg)
}
ws.close()
