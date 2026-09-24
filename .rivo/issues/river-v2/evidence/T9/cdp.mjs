// 通过 Chrome DevTools Protocol 驱动真实的 Electron 应用（渲染进程）
import fs from 'node:fs'

export async function connect(port = 9555) {
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
  }
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result.exceptionDetails) throw new Error(expr.slice(0, 80) + ' → ' + r.result.exceptionDetails.exception?.description)
    return r.result.result.value
  }
  await send('Runtime.enable')
  await send('Page.enable')
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const api = {
    errors, send, ev, sleep,
    size: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }),
    shot: async (file) => {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'))
    },
    // 按可见文字点击按钮（前缀匹配）
    click: (text) => ev(`(() => {
      const b = [...document.querySelectorAll('button,label')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(text)}) && !x.disabled)
      if (!b) return false
      b.click(); return true
    })()`),
    text: () => ev('document.body.innerText'),
    invoke: (cmd, ...args) => ev(`window.river.invoke(${JSON.stringify(cmd)}, ...${JSON.stringify(args)})`),
    view: () => ev(`window.river.invoke('app.bootstrap').then((b) => b.view)`),
    until: async (pred, ms = 20000) => {
      for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) if (await pred()) return true
      throw new Error('timeout waiting')
    },
    reload: async () => {
      await send('Page.reload')
      await sleep(1500)
    }
  }
  return api
}
