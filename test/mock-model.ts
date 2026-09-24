// 按脚本逐步返回的 LanguageModelV2 替身；每一步是一组工具调用或一段文本
export interface Step {
  tools?: { name: string; input: unknown }[]
  text?: string
  delayMs?: number
  error?: string
}

type Options = { tools?: { name: string }[]; toolChoice?: unknown; abortSignal?: AbortSignal; prompt?: { role: string; content: unknown }[] }
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 }

export function scriptModel(steps: Step[]) {
  const calls: { tools: string[]; toolChoice: unknown; system: string }[] = []
  let i = 0
  const model = {
    specificationVersion: 'v2',
    provider: 'mock',
    modelId: 'mock',
    supportedUrls: {},
    calls,
    async doGenerate(options: Options) {
      const step = await next(options)
      const content = step.tools ? toolParts(step) : [{ type: 'text', text: step.text ?? '' }]
      return { content, finishReason: step.tools ? 'tool-calls' : 'stop', usage, warnings: [] }
    },
    async doStream(options: Options) {
      const step = await next(options)
      const parts = step.tools
        ? toolParts(step)
        : [
            { type: 'text-start', id: 't' },
            ...[...(step.text ?? '')].map((ch) => ({ type: 'text-delta', id: 't', delta: ch })),
            { type: 'text-end', id: 't' }
          ]
      const all = [{ type: 'stream-start', warnings: [] }, ...parts, { type: 'finish', finishReason: step.tools ? 'tool-calls' : 'stop', usage }]
      return { stream: new ReadableStream({ start: (c) => (all.forEach((p) => c.enqueue(p)), c.close()) }) }
    }
  }
  async function next(options: Options): Promise<Step> {
    calls.push({
      tools: (options.tools ?? []).map((t) => t.name),
      toolChoice: options.toolChoice,
      system: (options.prompt ?? []).filter((m) => m.role === 'system').map((m) => String(m.content)).join('\n')
    })
    const step = steps[i++] ?? { text: 'ok' }
    if (step.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, step.delayMs)
        options.abortSignal?.addEventListener('abort', () => (clearTimeout(t), reject(new DOMException('aborted', 'AbortError'))))
      })
    }
    if (step.error) throw new Error(step.error)
    return step
  }
  const toolParts = (step: Step) => step.tools!.map((t, k) => ({ type: 'tool-call', toolCallId: `c${i}-${k}`, toolName: t.name, input: JSON.stringify(t.input) }))
  return model
}
