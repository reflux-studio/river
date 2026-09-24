// 本地 OpenAI 兼容假模型：让真实应用走完整链路（Mastra → HTTP → 工具调用）。
// 对手：调用 act（随机动作 + 台词 + 偶尔记印象）；复盘：调用 recap；其余（教练讲解、问答）流式输出一段文字。
// usage: PORT=8787 FAIL=0 node mock-llm.mjs    FAIL=1 时对手请求返回 500（验证停下与重试）
// 运行中切换：POST /__fail body 0|1|401（401 验证「去设置」）；POST /__fold body 1 时对手一律弃牌（验证教练局亮弃牌）
import http from 'node:http'

const port = Number(process.env.PORT || 8787)
let failOpponent = process.env.FAIL === '1' ? '1' : '0'
let foldAll = false
const SAY = ['这张牌对我太好了。', '谁敢跟？', '陪你玩。', '', '', '随缘。', '我有三个 A，信不信？', '', '加点料～', '']
const NOTE = ['玩家爱跟注', '', '', '玩家翻牌后很少下注', '']
const pick = (a) => a[(Math.random() * a.length) | 0]
const usage = { prompt_tokens: 850, completion_tokens: 60, total_tokens: 910 }

function actArgs(prompt) {
  const r = Math.random()
  const canRaise = /raise（/.test(prompt)
  if (canRaise && r < 0.12) return { action: 'raise', to: Number((prompt.match(/到总额 ([\d,]+)~/) ?? [])[1]?.replace(/,/g, '') ?? 0), say: pick(SAY), note: pick(NOTE) }
  if (r < 0.2) return { action: 'fold', say: pick(SAY) }
  return { action: 'call', say: pick(SAY), note: pick(NOTE) }
}

http.createServer(async (req, res) => {
  let body = ''
  for await (const c of req) body += c
  if (req.url === '/__fail') {
    failOpponent = body
    return res.end('ok')
  }
  if (req.url === '/__fold') {
    foldAll = body === '1'
    return res.end('ok')
  }
  const j = JSON.parse(body || '{}')
  const tools = (j.tools ?? []).map((t) => t.function?.name)
  const prompt = JSON.stringify(j.messages ?? [])
  const id = 'c' + Date.now()
  let msg
  if (tools.includes('act')) {
    if (failOpponent !== '0') {
      const code = failOpponent === '401' ? 401 : 500
      res.writeHead(code, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ error: { message: code === 401 ? 'Incorrect API key provided' : 'mock upstream error' } }))
    }
    await new Promise((r) => setTimeout(r, 300))
    msg = { role: 'assistant', content: null, tool_calls: [{ id: 'call_' + id, type: 'function', function: { name: 'act', arguments: JSON.stringify(foldAll ? { action: 'fold', say: '不跟了' } : actArgs(prompt)) } }] }
  } else if (tools.includes('recap')) {
    await new Promise((r) => setTimeout(r, 1200))
    const args = { headline: '这手你守住了纪律，没在不利时追加筹码', good: '翻牌前用 A♠ K♦ 这样的牌主动加注，拿到了主动权', improve: '转牌对手加注时，可以先算一下所需胜率再决定', tip: '胜率高于所需胜率就跟，低于就弃', note: '倾向于跟注过多' }
    msg = { role: 'assistant', content: null, tool_calls: [{ id: 'call_' + id, type: 'function', function: { name: 'recap', arguments: JSON.stringify(args) } }] }
  } else {
    const asking = /底池赔率/.test(prompt) && /user/.test(prompt) && prompt.includes('什么是')
    const text = asking
      ? '底池赔率就是你要跟的钱占跟注后总底池的比例。比如底池 300、你要跟 100，所需胜率就是 100 ÷ 400 = 25%。'
      : '现在你的胜率约 38%，所需胜率只有 25%，跟注是划算的。注意左边的阿狸很激进，他的加注范围很宽，别被吓到；如果翻牌没中，再考虑收手。'
    if (j.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      for (const ch of text.match(/.{1,6}/gsu)) {
        res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 0, model: j.model, choices: [{ index: 0, delta: { content: ch }, finish_reason: null }] })}\n\n`)
        // 提问回答放慢，便于截到暂停态
        await new Promise((r) => setTimeout(r, asking ? 250 : 40))
      }
      res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 0, model: j.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage })}\n\n`)
      return res.end('data: [DONE]\n\n')
    }
    msg = { role: 'assistant', content: text }
  }
  const finish = msg.tool_calls ? 'tool_calls' : 'stop'
  if (j.stream) {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    const delta = msg.tool_calls ? { role: 'assistant', tool_calls: msg.tool_calls.map((t, index) => ({ index, ...t })) } : { role: 'assistant', content: msg.content }
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 0, model: j.model, choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 0, model: j.model, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage })}\n\n`)
    return res.end('data: [DONE]\n\n')
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ id, object: 'chat.completion', created: 0, model: j.model, choices: [{ index: 0, message: msg, finish_reason: finish }], usage }))
}).listen(port, () => console.log('mock llm on', port))
