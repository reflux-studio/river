// 用真实按键打到第 N 手结束：轮到玩家按 C，一手结束按 N（偶数手改用空格）
const target = +process.argv[2]
const list = await (await fetch(`http://127.0.0.1:${process.env.PORT || 9337}/json`)).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0; const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m) }
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const key = async (k) => { const code = k === ' ' ? 'Space' : 'Key' + k.toUpperCase(); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text: k }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }) }
const state = async () => (await send('Runtime.evaluate', { returnByValue: true, expression: `(()=>{const t=document.body.innerText;return {turn:/轮到你 · 需跟注/.test(t)&&!/我看完了/.test(t),done:/下一手\\s*N/.test(t),hand:+(t.match(/第 (\\d+) 手/)||[])[1]}})()` })).result.result.value
const log = []
for (let i = 0; i < 2000; i++) {
  const s = await state()
  if (s.done && s.hand >= target) { log.push(`hand ${s.hand} done`); break }
  if (s.done) { await key(s.hand % 2 ? 'n' : ' '); log.push(`hand ${s.hand} done → ${s.hand % 2 ? 'N' : 'Space'}`); await new Promise((r) => setTimeout(r, 400)) }
  else if (s.turn) { await key('c'); log.push(`hand ${s.hand}: C`); await new Promise((r) => setTimeout(r, 300)) }
  else await new Promise((r) => setTimeout(r, 200))
}
console.log(log.join('\n'))
ws.close()
