// 一次性脚本：算出每个音效样本开头的静音长度，供 audio.ts 里的 onsets 常量使用。
// 运行：pnpm --filter river audio:onsets
// 素材替换或重新压制后重跑，把输出填回 renderer/src/lib/audio.ts。
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const dir = path.join(__dirname, '../src/renderer/src/assets/sounds')
const THRESHOLD = 0.02
const MARGIN = 0.005

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } })
  await win.loadURL('data:text/html,<html></html>')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ogg')).sort()
  const rows = []
  for (const file of files) {
    const base64 = fs.readFileSync(path.join(dir, file)).toString('base64')
    const onset = await win.webContents.executeJavaScript(`(async () => {
      const bin = atob(${JSON.stringify(base64)})
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const ctx = new OfflineAudioContext(1, 1, 44100)
      const audio = await ctx.decodeAudioData(bytes.buffer)
      let first = audio.length
      for (let ch = 0; ch < audio.numberOfChannels; ch++) {
        const data = audio.getChannelData(ch)
        let i = 0
        while (i < first && Math.abs(data[i]) <= ${THRESHOLD}) i++
        first = i
      }
      return first >= audio.length ? 0 : Math.max(0, first / audio.sampleRate - ${MARGIN})
    })()`)
    rows.push([file, onset])
  }
  // 输出按文件名；audio.ts 里按声音名（slide/place1/...）登记
  for (const [file, onset] of rows) console.log(`${file}\t${onset.toFixed(3)}`)
  app.quit()
}).catch((error) => { console.error(error); app.exit(1) })
