// Isolated defect regression: production renderer/preload; test-only IPC; no user DB/models/OS notifications.
const { app, BrowserWindow, ipcMain } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const root = '/Users/suziming/Documents/personal/river'
const evidence = path.join(root, '.rivo/issues/river-table-audio/evidence/defect-runtime')
fs.mkdirSync(evidence, { recursive: true })
app.setPath('userData', '/tmp/river-audio-defect-smoke-profile')
const settings = { speed: 1, coachPersona: 0, level: 'novice', hard: false, felt: 'green', feltCustom: '#2f6b55', back: 'red', fx: 'full', soundEnabled: true, soundVolume: 50, currency: 'cny', fxRate: null, models: { opponent: { providerId: 'test', modelId: 'test-model' } }, locale: 'zh' }
const seat = (name, ini, hero) => ({ name, tag: '', ini, hue: hero ? 255 : 80, stack: 9900, bet: 100, isDealer: hero, isSB: false, isBB: !hero, folded: false, out: false, allin: false, status: '', statusTone: 'muted', thinking: false, winner: false, cards: hero ? ['As', 'Kh'] : undefined, hasCards: true })
const makeView = handNo => ({ tableId: 'defect-smoke', mode: 'free', title: 'Deal regression', bb: 100, handNo, street: 'preflop', board: [], pot: 0, seats: [seat('You', 'Y', true), seat('AI', 'A', false)], hero: { legal: { toCall: 0, canCheck: true, minTo: 200, maxTo: 10000, canRaise: true, bet: 100, stack: 9900 }, toCall: 0, isTurn: true, canAct: false, defaultRaiseTo: 300, presets: [] }, done: false, runout: false, result: null, heroBust: false, nums: null, stalled: null, coach: null, guided: false, cost: { usd: 0, tokens: 0, unpriced: 0 } })
let tableVisible = false
let revision = 0
let sequence = 0
let notificationRevision = 0
const result = { platform: process.platform, electron: process.versions.electron, testBridge: true, realNotificationsShown: false, realNotificationPermissionVerified: false, limitations: ['Production renderer only; development StrictMode replay is covered separately by UI tests, not this runtime.', 'Test IPC bridge supplies views/events; no real runner/model/database.', 'Audio source scheduling is observed, not subjective listening or OS notification permission validation.'], errors: [], fileRequests: [], mockNotificationCalls: [] }
const status = (state = 'unknown', error) => ({ revision: ++notificationRevision, state, supported: true, permission: 'unknown', platform: process.platform, development: true, ...(error && { error }) })
ipcMain.handle('app.bootstrap', () => ({ settings, lobby: { size: 2, blinds: 1, picks: ['test-ai'], mode: 'free' }, bankroll: 100000, onboarded: true, personas: [{ id: 'test-ai', name: 'AI', ini: 'A', hue: 80, tag: '', desc: '', prompt: '', builtin: false, edited: false, deleted: false }], providers: [{ id: 'test', name: 'Test bridge (no API calls)', kind: 'test', keyTail: null, needsKey: false, supportsRequired: true }], view: null, viewRevision: 0, feedback: { tableId: null, seq: 0 }, coachThread: [], chat: [], version: '0.3.0', update: null, fx: null, packaged: false }))
ipcMain.handle('app.setTableVisible', (_e, visible) => { tableVisible = visible })
ipcMain.handle('settings.update', (_e, patch) => Object.assign(settings, patch))
ipcMain.handle('provider.registry', () => [])
ipcMain.handle('hands.list', () => [])
ipcMain.handle('notification.status', () => { result.mockNotificationCalls.push('status'); return status() })
ipcMain.handle('notification.prepare', () => { result.mockNotificationCalls.push('prepare'); return status('prepared') })
ipcMain.handle('notification.test', () => { result.mockNotificationCalls.push('test'); return status('failed', 'Isolated smoke failure') })
ipcMain.handle('notification.openSettings', () => { result.mockNotificationCalls.push('openSettings') })
ipcMain.handle('table.start', () => { sendHand(1) })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
let win
function sendFeedback(kind, handNo, extra = {}) {
  win.webContents.send('table:feedback', { tableId: 'defect-smoke', handNo, seq: ++sequence, at: Date.now(), kind, ...extra })
}
function sendHand(handNo) {
  win.webContents.send('table:view', { revision: ++revision, view: makeView(handNo) })
  sendFeedback('deal', handNo, { count: 4 })
}
async function evaluate(source) { return win.webContents.executeJavaScript(source) }
async function waitFor(source) {
  for (let i = 0; i < 80; i++) { if (await evaluate(source)) return; await sleep(75) }
  throw new Error(`Timed out: ${source}`)
}
async function click(text, attribute, prefix = false) {
  const source = attribute ? `document.querySelector(${JSON.stringify(attribute)})` : `[...document.querySelectorAll('button')].find(e=>e.textContent${prefix ? '.startsWith' : '==='}${prefix ? `(${JSON.stringify(text)})` : JSON.stringify(text)})`
  const pos = await evaluate(`(() => { const e=${source};if(!e)throw new Error('Missing click target');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...pos })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...pos })
  await sleep(80)
}
async function resetTrace() { await evaluate('window.__voiceTrace=[];window.__dealTrace=[];void 0;') }
async function trace() { return evaluate('({sounds:window.__voiceTrace,animations:window.__dealTrace})') }
function dealPass(trace, soundCount) {
  return trace.animations.length === 4 && trace.animations.every((a, i) => a.delay === i * 170 && a.duration === 500) && trace.sounds.length === soundCount
}
app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1280, height: 800, show: true, webPreferences: { preload: path.join(root, 'apps/desktop/out/preload/index.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } })
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) result.errors.push(message) })
  win.webContents.session.webRequest.onCompleted(details => { if (details.url.endsWith('.ogg')) result.fileRequests.push({ url: details.url, status: details.statusCode }) })
  await win.loadFile(path.join(root, 'apps/desktop/out/renderer/index.html'))
  await waitFor(`document.body.textContent.includes('开一桌')`)
  await evaluate(`window.__voiceTrace=[];window.__dealTrace=[];window.__voiceStops=0;
    const originalAnimate=Element.prototype.animate, originalStart=AudioBufferSourceNode.prototype.start, originalStop=AudioBufferSourceNode.prototype.stop;
    Element.prototype.animate=function(frames,options){if(this.parentElement?.matches('[data-seat-cards]')&&JSON.stringify(frames).includes('rotate(-40deg)'))window.__dealTrace.push({at:performance.now(),delay:options.delay,duration:options.duration});return originalAnimate.call(this,frames,options)};
    AudioBufferSourceNode.prototype.start=function(...args){window.__voiceTrace.push({at:performance.now(),state:this.context.state,duration:this.buffer?.duration});return originalStart.apply(this,args)};
    AudioBufferSourceNode.prototype.stop=function(...args){window.__voiceStops++;return originalStop.apply(this,args)};void 0;`)
  await click('设置')
  await waitFor(`document.body.textContent.includes('牌局音效')`)
  await click('试听')
  await sleep(450)
  result.preview = await trace()
  await click('大厅')
  await resetTrace()
  await click('入座 ·', undefined, true)
  await waitFor(`window.__dealTrace.length===4`)
  fs.writeFileSync(path.join(evidence, 'first-deal.png'), (await win.capturePage()).toPNG())
  await sleep(700)
  result.firstDeal = await trace()
  result.firstDeal.firstStartDifferenceMs = Math.abs(result.firstDeal.sounds[0]?.at - result.firstDeal.animations[0]?.at)
  await click('设置')
  win.webContents.send('notification:status', status('failed', 'Simulated notification failure, not an OS request'))
  await waitFor(`document.querySelector('[role="status"]')?.textContent.includes('系统未能发送后台提醒')`)
  result.notificationFailureUI = await evaluate(`({failure:document.querySelector('[role="status"]')?.textContent,development:document.body.textContent.includes('Electron'),help:document.body.textContent.includes('系统设置'),openSettingsButton:[...document.querySelectorAll('button')].some(e=>e.textContent==='打开通知设置')})`)
  await evaluate(`document.querySelector('[role="status"]').scrollIntoView({block:'center'});void 0;`)
  fs.writeFileSync(path.join(evidence, 'notification-failure.png'), (await win.capturePage()).toPNG())
  await click('打开通知设置')
  await click('牌桌')
  await sleep(250)
  result.roundTrip = await trace()
  result.roundTrip.noReplay = result.roundTrip.sounds.length === result.firstDeal.sounds.length && result.roundTrip.animations.length === result.firstDeal.animations.length
  await resetTrace()
  sendHand(2)
  await waitFor(`window.__dealTrace.length===4`)
  await sleep(700)
  result.nextDeal = await trace()
  result.nextDeal.firstStartDifferenceMs = Math.abs(result.nextDeal.sounds[0]?.at - result.nextDeal.animations[0]?.at)
  await click(null, '[aria-label="静音"]')
  await resetTrace()
  sendHand(3)
  await waitFor(`window.__dealTrace.length===4`)
  await sleep(700)
  result.mutedDeal = await trace()
  await click(null, '[aria-label="恢复音效"]')
  await resetTrace()
  win.minimize()
  await sleep(100)
  sendFeedback('check', 3)
  await sleep(250)
  result.background = { minimized: win.isMinimized(), ...(await trace()) }
  win.restore()
  win.focus()
  await resetTrace()
  sendFeedback('allin', 3)
  await sleep(20)
  await click(null, '[aria-label="静音"]')
  const mutedAt = (await trace()).sounds.length
  await sleep(250)
  result.immediateMute = { enabled: settings.soundEnabled, before: mutedAt, after: (await trace()).sounds.length, stops: await evaluate('window.__voiceStops') }
  result.tableVisible = tableVisible
  result.assertions = {
    files: result.fileRequests.length === 12 && result.fileRequests.every(r => r.status === 200),
    firstDeal: dealPass(result.firstDeal, 4) && result.firstDeal.firstStartDifferenceMs < 45,
    nextDeal: dealPass(result.nextDeal, 4) && result.nextDeal.firstStartDifferenceMs < 45,
    roundTrip: result.roundTrip.noReplay,
    mutedDeal: dealPass(result.mutedDeal, 0),
    background: result.background.minimized && result.background.sounds.length === 2,
    immediateMute: !result.immediateMute.enabled && result.immediateMute.after === mutedAt && result.immediateMute.stops > 0,
    failureUI: !!result.notificationFailureUI.failure && result.notificationFailureUI.development && result.notificationFailureUI.help && result.notificationFailureUI.openSettingsButton,
    mockSettings: result.mockNotificationCalls.includes('openSettings'),
    noConsoleErrors: result.errors.length === 0
  }
  result.pass = Object.values(result.assertions).every(Boolean)
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  app.exit(result.pass ? 0 : 1)
}).catch(error => {
  result.errors.push(String(error)); result.failureStack=error.stack
  fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify(result, null, 2))
  console.error(error)
  app.exit(1)
})
