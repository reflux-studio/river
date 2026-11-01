// Isolated runtime check: production renderer/preload, test-only IPC data, no models or user database.
const { app, BrowserWindow, ipcMain, Notification } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const root = '/Users/suziming/Documents/personal/river'
const evidence = path.join(root, '.rivo/issues/river-table-audio/evidence/electron-runtime')
fs.mkdirSync(evidence, { recursive: true })
app.setPath('userData', '/tmp/river-audio-smoke-profile')
const settings = { speed: 1, coachPersona: 0, level: 'novice', hard: false, felt: 'green', feltCustom: '#2f6b55', back: 'red', fx: 'full', soundEnabled: true, soundVolume: 50, currency: 'cny', fxRate: null, models: {}, locale: 'zh' }
const seat = (name, ini, hero) => ({ name, tag: '', ini, hue: hero ? 255 : 80, stack: 9900, bet: 100, isDealer: hero, isSB: false, isBB: !hero, folded: false, out: false, allin: false, status: '', statusTone: 'muted', thinking: false, winner: false, cards: hero ? ['As', 'Kh'] : undefined, hasCards: true })
const view = { tableId: 'smoke', mode: 'free', title: 'Audio runtime check', bb: 100, handNo: 1, street: 'preflop', board: [], pot: 0, seats: [seat('You', 'Y', true), seat('AI', 'A', false)], hero: { legal: { toCall: 0, canCheck: true, minTo: 200, maxTo: 10000, canRaise: true, bet: 100, stack: 9900 }, toCall: 0, isTurn: true, canAct: true, defaultRaiseTo: 300, presets: [] }, done: false, runout: false, result: null, heroBust: false, nums: null, stalled: null, coach: null, guided: false, cost: { usd: 0, tokens: 0, unpriced: 0 } }
let tableVisible = false
ipcMain.handle('app.bootstrap', () => ({ settings, lobby: { size: 2, blinds: 1, picks: [], mode: 'free' }, bankroll: 100000, onboarded: true, personas: [], providers: [], view: null, viewRevision: 0, feedback: { tableId: null, seq: 0 }, coachThread: [], chat: [], version: '0.3.0', update: null, fx: null, packaged: false }))
ipcMain.handle('app.setTableVisible', (_e, visible) => { tableVisible = visible })
ipcMain.handle('settings.update', (_e, patch) => Object.assign(settings, patch))
ipcMain.handle('provider.registry', () => [])
ipcMain.handle('hands.list', () => [])
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))
let win
const result = { platform: process.platform, electron: process.versions.electron, testBridge: true, realNotificationsShown: false, errors: [], fileRequests: [] }
async function evaluate(source) { return win.webContents.executeJavaScript(source) }
async function waitFor(source) {
  for (let i = 0; i < 50; i++) { if (await evaluate(source)) return; await sleep(100) }
  throw new Error(`Timed out: ${source}`)
}
async function click(text, attribute) {
  const pos = await evaluate(`(() => { const e = ${attribute ? `document.querySelector(${JSON.stringify(attribute)})` : `[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)})`}; const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...pos })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...pos })
  await sleep(80)
}
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1280, height: 800, show: true, webPreferences: { preload: path.join(root, 'apps/desktop/out/preload/index.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) result.errors.push(message) })
  win.webContents.session.webRequest.onCompleted(details => {
    if (details.url.endsWith('.ogg')) result.fileRequests.push({ url: details.url, status: details.statusCode })
  })
  await win.loadFile(path.join(root, 'apps/desktop/out/renderer/index.html'))
  await waitFor(`document.body.textContent.includes('开一桌')`)
  await evaluate(`window.__voiceStarts=0;window.__voiceStops=0;window.__voiceStates=[];
    const originalStart=AudioBufferSourceNode.prototype.start, originalStop=AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start=function(...args){window.__voiceStarts++;window.__voiceStates.push(this.context.state);return originalStart.apply(this,args)};
    AudioBufferSourceNode.prototype.stop=function(...args){window.__voiceStops++;return originalStop.apply(this,args)};void 0;`)
  await click('设置')
  await waitFor(`document.body.textContent.includes('牌局音效')`)
  await click('试听')
  await sleep(400)
  result.preview = await evaluate(`({ starts:window.__voiceStarts, states:window.__voiceStates, ogg:performance.getEntriesByType('resource').filter(e=>e.name.endsWith('.ogg')).map(e=>({url:e.name,bytes:e.decodedBodySize})) })`)
  fs.writeFileSync(path.join(evidence, 'settings.png'), (await win.capturePage()).toPNG())
  win.webContents.send('table:view', { revision: 1, view })
  await sleep(80)
  win.webContents.send('app:showTable', { tableId: 'smoke' })
  await waitFor(`!!document.querySelector('[aria-label="静音"]')`)
  result.tableVisible = tableVisible
  fs.writeFileSync(path.join(evidence, 'table.png'), (await win.capturePage()).toPNG())
  win.minimize()
  await sleep(100)
  const before = await evaluate('window.__voiceStarts')
  win.webContents.send('table:feedback', { tableId: 'smoke', handNo: 1, seq: 1, at: Date.now(), kind: 'check' })
  await sleep(250)
  result.background = { minimized: win.isMinimized(), before, after: await evaluate('window.__voiceStarts') }
  win.restore()
  win.focus()
  win.webContents.send('table:feedback', { tableId: 'smoke', handNo: 1, seq: 2, at: Date.now(), kind: 'allin' })
  await sleep(50)
  await click(null, '[aria-label="静音"]')
  const mutedAt = await evaluate('window.__voiceStarts')
  await sleep(250)
  result.mute = { enabled: settings.soundEnabled, before: mutedAt, after: await evaluate('window.__voiceStarts'), stops: await evaluate('window.__voiceStops') }
  result.notificationSupported = Notification.isSupported()
  result.pass = result.preview.starts >= 1 && result.fileRequests.length === 12 && result.fileRequests.every(r => r.status === 200) && result.background.after === before + 2 && result.mute.enabled === false && result.mute.after === mutedAt && result.mute.stops >= 1 && result.errors.length === 0
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  app.exit(result.pass ? 0 : 1)
}).catch(error => {
  result.errors.push(String(error))
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.error(error)
  app.exit(1)
})
