// T8 官网验证：node check.mjs <port> <scenario>，连接 headless Chrome（--remote-debugging-port），场景见文件末尾
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [port, scenario, base = 'http://localhost:4321/river'] = process.argv.slice(2)
const OUT = dirname(fileURLToPath(import.meta.url))
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    m.error ? rej(new Error(m.error.message)) : res(m.result)
  } else if (m.method === 'Runtime.exceptionThrown') errors.push('exception: ' + m.params.exceptionDetails.exception?.description)
  else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) errors.push(`console.${m.params.type}: ` + m.params.args.map((a) => a.value ?? a.description).join(' '))
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url ?? ''))
})
const call = (method, params = {}) => new Promise((res, rej) => { const my = ++id; pending.set(my, { res, rej }); ws.send(JSON.stringify({ id: my, method, params })) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ev = async (expr) => (await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value
const size = (w, h) => call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 500 })
const go = async (path) => { await call('Page.navigate', { url: base + path }); await sleep(2500) }
const shot = async (name, full = false) => {
  mkdirSync(OUT, { recursive: true })
  const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full && { clip: { x: 0, y: 0, width: await ev('innerWidth'), height: await ev('document.documentElement.scrollHeight'), scale: 1 } }) })
  writeFileSync(join(OUT, name), Buffer.from(r.data, 'base64'))
  console.log('shot', name)
}
const scrollTo = (sel) => ev(`scrollTo(0, document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().top + scrollY - 72)`)
await call('Runtime.enable')
await call('Log.enable')
await call('Page.enable')
await call('Network.enable')

const S = {
  // 演示桌连续 20 手：读首屏“第 N 手”，同时收集控制台报错
  async hands() {
    await size(1280, 900)
    await go('/')
    const hand = () => ev(`(document.body.innerText.match(/第 (\\d+) 手/)||[])[1]|0`)
    const t0 = Date.now()
    let n = await hand()
    while (n < 21 && Date.now() - t0 < 900_000) { await sleep(5000); n = await hand() }
    console.log('hand reached', n, 'in', Math.round((Date.now() - t0) / 1000), 's')
    await shot('zh-demo-after-20-hands.png')
  },
  async handsEn() {
    await size(1280, 900)
    await go('/en/')
    const hand = () => ev(`(document.body.innerText.match(/Hand (\\d+)/)||[])[1]|0`)
    const t0 = Date.now()
    let n = await hand()
    while (n < 21 && Date.now() - t0 < 900_000) { await sleep(5000); n = await hand() }
    console.log('hand reached', n, 'in', Math.round((Date.now() - t0) / 1000), 's')
    const han = await ev(`[...document.querySelectorAll('[data-seat]')].map(e=>e.parentElement.innerText).join('|')`)
    console.log('seat texts', han)
    await shot('en-demo-after-20-hands.png')
  },
  // 暂停后手数与桌面不变，继续后恢复
  async pause() {
    await size(1280, 900)
    await go('/')
    await sleep(3000)
    // 只看座位、公共牌与底池（特效层的临时文字会自行消失，不算桌面状态）
    const snap = () => ev(`[...document.querySelectorAll('[data-seat],[data-boardrow],[data-pot]')].map(e=>e.parentElement.innerText).join('|')`)
    const btn = `[...document.querySelectorAll('button')].find(b=>/^(暂停|继续)$/.test(b.textContent))`
    await ev(`${btn}.click()`)
    const a = await snap()
    await sleep(6000)
    const b = await snap()
    console.log('paused unchanged:', a === b, 'label:', await ev(`${btn}.textContent`))
    await ev(`${btn}.click()`)
    await sleep(6000)
    console.log('resumed changed:', (await snap()) !== b, 'label:', await ev(`${btn}.textContent`))
  },
  // 全页截图（桌面宽度与 375px），并检查 375px 无横向滚动
  async pages() {
    for (const [lang, path] of [['zh', '/'], ['en', '/en/']]) {
      await size(1280, 900)
      await go(path)
      await sleep(2000)
      await shot(`${lang}-full-1280.png`, true)
      await size(375, 812)
      await go(path)
      await sleep(1500)
      console.log(lang, '375 scrollWidth', await ev('document.documentElement.scrollWidth'), 'clientWidth', await ev('document.documentElement.clientWidth'))
      await shot(`${lang}-full-375.png`, true)
    }
  },
  // 逐区块截图
  async sections() {
    for (const [lang, path] of [['zh', '/'], ['en', '/en/']]) {
      await size(1280, 900)
      await go(path)
      await sleep(3000)
      await shot(`${lang}-01-hero.png`)
      for (const [k, sel] of [['02-regulars', '#regulars'], ['03-chat', '#features > div > div:nth-child(1)'], ['04-coach', '#features > div > div:nth-child(2)'], ['05-recap', '#features > div > div:nth-child(3)'], ['06-effects', 'section:nth-of-type(4)'], ['07-models', '#models'], ['08-extras', 'section:nth-of-type(6)'], ['09-download', '#download'], ['10-faq', '#faq'], ['11-end', 'section:nth-of-type(9)']]) {
        await scrollTo(sel)
        await sleep(1200)
        await shot(`${lang}-${k}.png`)
      }
    }
  },
  // 外观：切牌桌色、牌背、特效档位，演示桌同步
  async appearance() {
    await size(1280, 900)
    await go('/')
    await scrollTo('section:nth-of-type(4)')
    await sleep(500)
    await ev(`document.querySelector('button[title="酒红"]').click()`)
    await ev(`document.querySelector('button[aria-label="green"]').click()`)
    await sleep(300)
    const allin = () => ev(`[...document.querySelectorAll('div')].filter(d=>d.textContent==='ALL IN').length`)
    let seen = 0
    for (let k = 0; k < 8 && !seen; k++) { await sleep(400); seen = await allin() }
    console.log('ALL IN tag seen in showcase (full):', seen > 0)
    await shot('zh-effects-wine-green-allin.png')
    await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent==='关闭').click()`)
    await sleep(3500)
    console.log('ALL IN after off:', await allin())
    await ev(`window.scrollTo(0,0)`)
    await sleep(800)
    await shot('zh-demo-wine-green.png')
    console.log('demo felt uses wine:', await ev(`[...document.querySelectorAll('[data-boardrow]')][0].closest('.relative').innerHTML.includes('oklch(0.42 0.12 18)')`))
  },
  // 屏蔽 api.github.com：下载链接退回 releases/latest
  async offline() {
    await call('Network.setBlockedURLs', { urls: ['*api.github.com*'] })
    await size(1280, 900)
    await go('/')
    await sleep(1500)
    console.log('blocked links:', await ev(`[...document.querySelectorAll('a')].filter(a=>/releases/.test(a.href)).map(a=>a.textContent.trim()+' -> '+a.href).join('\\n')`))
    await scrollTo('#download')
    await sleep(500)
    await shot('zh-download-blocked.png')
    await call('Network.setBlockedURLs', { urls: [] })
    await go('/')
    await sleep(2500)
    console.log('online links:', await ev(`[...document.querySelectorAll('a')].filter(a=>/releases/.test(a.href)).map(a=>a.textContent.trim()+' -> '+a.href).join('\\n')`))
  },
  // 英文浏览器打开 /：出现 English 提示；关闭后刷新不再出现；语言切换链接带 base 往返
  async hint() {
    await size(1280, 900)
    await go('/')
    await ev(`localStorage.clear()`)
    await go('/')
    console.log('navigator.language', await ev('navigator.language'))
    const vis = () => ev(`!document.getElementById('en-hint').hidden`)
    console.log('hint visible:', await vis())
    await shot('zh-en-hint.png')
    await ev(`document.querySelector('#en-hint button').click()`)
    console.log('after close:', await vis())
    await go('/')
    console.log('after reload:', await vis())
    const en = await ev(`[...document.querySelectorAll('header a')].find(a=>a.textContent==='EN').href`)
    console.log('EN link', en)
    await call('Page.navigate', { url: en })
    await sleep(2000)
    console.log('at', await ev('location.pathname'), 'lang', await ev('document.documentElement.lang'), 'title', await ev('document.title'))
    const zh = await ev(`[...document.querySelectorAll('header a')].find(a=>a.textContent==='中').href`)
    console.log('中 link', zh)
    await call('Page.navigate', { url: zh })
    await sleep(2000)
    console.log('at', await ev('location.pathname'), 'lang', await ev('document.documentElement.lang'))
  }
}
await S[scenario]()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
ws.close()
