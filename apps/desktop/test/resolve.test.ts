import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../src/main/db'
import { clearNeedsKey, modelFor, modelReady, needsKey, selectedModel, testProvider } from '../src/main/models/resolve'

let dir: string
let failDecrypt = false
const crypto = {
  encrypt: (t: string) => Buffer.from(t),
  decrypt: (b: Buffer) => {
    if (failDecrypt) throw new Error('keychain changed')
    return b.toString()
  }
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'river-resolve-'))
  failDecrypt = false
  needsKey.clear()
  await db.initDb({ url: 'file:' + join(dir, 'river.db'), ...crypto })
})

afterEach(() => {
  db.closeDb()
  rmSync(dir, { recursive: true, force: true })
})

describe('modelFor / modelReady', () => {
  it('内置提供方返回 { id, apiKey }，不带 url', async () => {
    await db.saveProvider({ id: 'a', name: 'A', kind: 'anthropic', baseUrl: 'http://ignored', apiKey: 'sk-1' })
    await db.updateSettings({ models: { coach: { providerId: 'a', modelId: 'claude-x' } } })
    expect(modelFor('coach')).toEqual({ id: 'anthropic/claude-x', apiKey: 'sk-1' })
    expect(modelReady('coach')).toBe(true)
    expect(selectedModel('coach')).toEqual({ kind: 'anthropic', modelId: 'claude-x' })
  })

  it('兼容接口返回 { providerId, modelId, url, apiKey }', async () => {
    await db.saveProvider({ id: 'c', name: 'C', kind: 'openai-compatible', baseUrl: 'http://localhost:1234/v1' })
    await db.updateSettings({ models: { opponent: { providerId: 'c', modelId: 'qwen' } } })
    expect(modelFor('opponent')).toEqual({ providerId: 'c', modelId: 'qwen', url: 'http://localhost:1234/v1', apiKey: undefined })
  })

  it('未配置、提供方不存在时未就绪', async () => {
    expect(modelReady('opponent')).toBe(false)
    expect(() => modelFor('opponent')).toThrow()
    await db.saveProvider({ id: 'a', name: 'A', kind: 'openai', apiKey: 'sk-1' })
    await db.updateSettings({ models: { opponent: { providerId: 'a', modelId: 'm' } } })
    expect(modelReady('opponent')).toBe(true)
    // 删除后又被设回：引用悬空，仍视为未配置
    await db.deleteProvider('a')
    await db.updateSettings({ models: { opponent: { providerId: 'a', modelId: 'm' } } })
    expect(modelReady('opponent')).toBe(false)
  })

  it('解密失败置 needsKey 并返回未就绪；clearNeedsKey 后恢复', async () => {
    await db.saveProvider({ id: 'a', name: 'A', kind: 'openai', apiKey: 'sk-1' })
    await db.updateSettings({ models: { coach: { providerId: 'a', modelId: 'm' } } })
    failDecrypt = true
    expect(modelReady('coach')).toBe(false)
    expect(needsKey.has('a')).toBe(true)
    expect(db.listProviders(needsKey)[0].needsKey).toBe(true)
    failDecrypt = false
    expect(modelReady('coach')).toBe(false)
    clearNeedsKey('a')
    expect(modelReady('coach')).toBe(true)
  })
})

// 最小的 OpenAI 兼容端点：可拒绝 tool_choice=required，可延迟响应
function fakeEndpoint(opts: { rejectRequired: boolean; delayMs?: number }) {
  const seen: unknown[] = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (d) => (body += d))
    req.on('end', async () => {
      const json = JSON.parse(body)
      seen.push(json.tool_choice)
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
      if (opts.rejectRequired && json.tool_choice === 'required') {
        res.writeHead(400, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ error: { message: 'tool_choice required not supported' } }))
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'm',
        choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }))
    })
  })
  return new Promise<{ server: Server; url: string; seen: unknown[] }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, seen }))
  )
}

describe('testProvider', () => {
  it('接受 required：记 supportsRequired=true', async () => {
    const ep = await fakeEndpoint({ rejectRequired: false })
    await db.saveProvider({ id: 'c', name: 'C', kind: 'openai-compatible', baseUrl: ep.url })
    expect(await testProvider('c', 'm')).toEqual({ ok: true, supportsRequired: true })
    expect(ep.seen).toEqual(['required'])
    expect(db.listProviders()[0].supportsRequired).toBe(true)
    ep.server.close()
  })

  it('拒绝 required、auto 成功：记 supportsRequired=false', async () => {
    const ep = await fakeEndpoint({ rejectRequired: true })
    await db.saveProvider({ id: 'c', name: 'C', kind: 'openai-compatible', baseUrl: ep.url })
    expect(await testProvider('c', 'm')).toEqual({ ok: true, supportsRequired: false })
    expect(ep.seen.at(-1)).toBe('auto')
    expect(db.listProviders()[0].supportsRequired).toBe(false)
    ep.server.close()
  })

  it('测试期间 baseUrl 被改或提供方被删：不写回', async () => {
    const ep = await fakeEndpoint({ rejectRequired: false, delayMs: 100 })
    await db.saveProvider({ id: 'c', name: 'C', kind: 'openai-compatible', baseUrl: ep.url })
    const pending = testProvider('c', 'm')
    await db.saveProvider({ id: 'c', name: 'C', kind: 'openai-compatible', baseUrl: ep.url + '/other' })
    expect((await pending).ok).toBe(true)
    expect(db.listProviders()[0].supportsRequired).toBeNull()

    const pending2 = testProvider('c', 'm')
    await db.deleteProvider('c')
    await pending2
    expect(db.listProviders()).toEqual([])
    ep.server.close()
  })

  it('端点不可达：返回错误', async () => {
    await db.saveProvider({ id: 'c', name: 'C', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:9/v1' })
    const r = await testProvider('c', 'm')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
