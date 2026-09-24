// usage: node cdp.mjs eval '<expr>' | shot <file> [w h] | size <w> <h>
const [cmd, a, b, c] = process.argv.slice(2)
const port = process.env.PORT || 9337
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m) }
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
if (cmd === 'eval') {
  const r = await send('Runtime.evaluate', { expression: a, awaitPromise: true, returnByValue: true })
  console.log(JSON.stringify(r.result.result?.value ?? r.result, null, 1))
} else if (cmd === 'size' || (cmd === 'shot' && b)) {
  const [w, h] = cmd === 'size' ? [a, b] : [b, c]
  await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false })
  await new Promise((r) => setTimeout(r, 400))
}
if (process.env.PRE) {
  const r = await send('Runtime.evaluate', { expression: process.env.PRE, awaitPromise: true, returnByValue: true })
  console.log('pre:', JSON.stringify(r.result.result?.value))
  await new Promise((r) => setTimeout(r, 500))
}
if (cmd === 'shot') {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  const fs = await import('node:fs'); fs.writeFileSync(a, Buffer.from(r.result.data, 'base64')); console.log('saved', a)
}
if (cmd === 'key') {
  const code = a === ' ' ? 'Space' : a === 'Enter' ? 'Enter' : 'Key' + a.toUpperCase()
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: a, code, text: a === 'Enter' ? '\r' : a, windowsVirtualKeyCode: a === 'Enter' ? 13 : undefined })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: a, code })
}
if (cmd === 'clear') await send('Emulation.clearDeviceMetricsOverride')
ws.close()
