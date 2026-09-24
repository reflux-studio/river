// T1 技术验证：证明 Electron 主进程（ESM）内 Mastra + libsql + safeStorage 的前提成立。
// 由 --spike 或 RIVER_SPIKE=1 触发，结果写入 userData/spike-result.json。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'
import { Agent } from '@mastra/core/agent'
import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { RequestContext } from '@mastra/core/request-context'
import { createTool } from '@mastra/core/tools'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import { createClient } from '@libsql/client'
import { z } from 'zod'

const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }

// 首步同时调用业务工具与 updateWorkingMemory，之后只回文本；stopWhen 应在首步后停下
function mockModel() {
  let calls = 0
  const toolCalls = [
    { type: 'tool-call', toolCallId: 'c1', toolName: 'updateWorkingMemory', input: JSON.stringify({ memory: '# 印象\n- spike ok' }) },
    { type: 'tool-call', toolCallId: 'c2', toolName: 'record', input: JSON.stringify({ note: 'hello' }) }
  ]
  const text = [{ type: 'text-start', id: 't' }, { type: 'text-delta', id: 't', delta: 'done' }, { type: 'text-end', id: 't' }]
  return {
    specificationVersion: 'v2',
    provider: 'mock',
    modelId: 'spike',
    supportedUrls: {},
    get calls() {
      return calls
    },
    async doGenerate() {
      return ++calls === 1
        ? { content: toolCalls, finishReason: 'tool-calls', usage, warnings: [] }
        : { content: [{ type: 'text', text: 'done' }], finishReason: 'stop', usage, warnings: [] }
    },
    async doStream() {
      const first = ++calls === 1
      const parts = [
        { type: 'stream-start', warnings: [] },
        ...(first ? toolCalls : text),
        { type: 'finish', finishReason: first ? 'tool-calls' : 'stop', usage }
      ]
      return { stream: new ReadableStream({ start: (c) => (parts.forEach((p) => c.enqueue(p)), c.close()) }) }
    }
  }
}

function checkSafeStorage() {
  const file = join(app.getPath('userData'), 'spike-key.bin')
  const plain = 'sk-river-spike'
  const available = safeStorage.isEncryptionAvailable()
  if (!available) return { available, ok: false }
  if (existsSync(file)) {
    const decrypted = safeStorage.decryptString(readFileSync(file))
    return { available, mode: 'decrypt', ok: decrypted === plain }
  }
  writeFileSync(file, safeStorage.encryptString(plain))
  return { available, mode: 'encrypt', ok: existsSync(file) }
}

export async function runSpike() {
  const userData = app.getPath('userData')
  const dbPath = join(userData, 'river.db')
  const result: Record<string, unknown> = { version: app.getVersion(), packaged: app.isPackaged, userData, at: new Date().toISOString() }
  const checks: Record<string, boolean> = {}
  try {
    const storage = new LibSQLStore({ id: 'river', url: 'file:' + dbPath })
    await storage.init()
    const memory = new Memory({ storage, options: { workingMemory: { enabled: true, scope: 'resource' } } })

    const model = mockModel()
    let resolvedFor: unknown
    let recorded: unknown
    const record = createTool({
      id: 'record',
      description: 'record a note',
      inputSchema: z.object({ note: z.string() }),
      execute: async (input) => {
        recorded = input
        return { ok: true }
      }
    })
    const agent = new Agent({
      id: 'spike',
      name: 'spike',
      instructions: 'spike',
      // 真实实现按 RequestContext 里的用户模型配置解析；此处只验证函数式 model 能拿到上下文
      model: ({ requestContext }) => {
        resolvedFor = requestContext.get('model')
        return model as never
      },
      tools: { record },
      memory
    })

    const rc = new RequestContext()
    rc.set('model', { providerId: 'mock', modelId: 'spike' })
    const ac = new AbortController()
    const mem = { thread: 'spike-thread', resource: 'spike-user' }
    const r = await agent.generate('hi', {
      requestContext: rc,
      memory: mem,
      maxSteps: 5,
      activeTools: ['record', 'updateWorkingMemory'],
      stopWhen: ({ steps }: { steps: { toolCalls?: { toolName: string }[] }[] }) =>
        steps.at(-1)?.toolCalls?.some((c) => c.toolName === 'record') ?? false,
      abortSignal: ac.signal
    })

    const memTools = Object.keys((await agent.getMemory())?.listTools() ?? {})
    const wm = await memory.getWorkingMemory({ threadId: 'spike-thread', resourceId: 'spike-user' })

    const aborted = new AbortController()
    aborted.abort()
    const ra = await agent.generate('hi', { requestContext: rc, memory: mem, abortSignal: aborted.signal })

    const db = createClient({ url: 'file:' + dbPath })
    const tables = (await db.execute("select name from sqlite_master where type='table' and name like 'mastra_%'")).rows.map((x) => String(x.name))
    db.close()

    Object.assign(result, {
      modelCalls: model.calls,
      steps: r.steps?.length,
      finishReason: r.finishReason,
      resolvedFor,
      recorded,
      memTools,
      workingMemory: wm,
      abortedFinishReason: ra.finishReason,
      mastraTables: tables,
      providerCount: Object.keys(PROVIDER_REGISTRY).length
    })
    checks.toolExecuted = (recorded as { note?: string })?.note === 'hello'
    checks.modelFnGotRequestContext = (resolvedFor as { modelId?: string })?.modelId === 'spike'
    checks.stopWhenStoppedAfterFirstStep = model.calls === 1
    checks.memoryHasUpdateWorkingMemory = memTools.includes('updateWorkingMemory')
    checks.workingMemoryWritten = typeof wm === 'string' && wm.includes('spike ok')
    checks.abortedReturnsWithoutThrow = ra.finishReason === 'aborted'
    checks.mastraTablesInRiverDb = tables.length > 0
    checks.providerRegistryReadable = Object.keys(PROVIDER_REGISTRY).length > 0
  } catch (e) {
    result.error = e instanceof Error ? e.stack : String(e)
  }
  const ss = checkSafeStorage()
  result.safeStorage = ss
  checks.safeStorage = ss.ok
  result.checks = checks
  result.pass = !result.error && Object.values(checks).every(Boolean)
  writeFileSync(join(userData, 'spike-result.json'), JSON.stringify(result, null, 2))
  console.log('[spike]', JSON.stringify(result, null, 2))
  return result
}
