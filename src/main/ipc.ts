import type { App, IpcMain } from 'electron'
import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { PERSONAS } from '../shared/personas'
import type { Commands } from '../shared/types'
import { resetMemories } from './agents/mastra'
import {
  clearHistory, deleteProvider, getBankroll, getHand, getLobby, getOnboarded, getPromptOverrides, getReview, getSettings,
  listHands, listProviders, resetPrompt, saveProvider, setOnboarded, setPrompt, updateLobby, updateSettings
} from './db'
import { clearNeedsKey, needsKey, testProvider } from './models/resolve'
import type { TableRunner } from './table/runner'

type Handlers = { [K in keyof Commands]: (...args: Parameters<Commands[K]>) => ReturnType<Commands[K]> | Promise<ReturnType<Commands[K]>> }

export function commandHandlers(runner: TableRunner): Handlers {
  return {
    'app.bootstrap': async () => {
      const overrides = await getPromptOverrides()
      const onboarded = await getOnboarded()
      return {
        settings: getSettings(),
        lobby: getLobby(),
        bankroll: runner.bankroll,
        onboarded,
        personas: PERSONAS.map((p) => ({ ...p, ...(overrides[p.id] !== undefined && { promptOverride: overrides[p.id] }) })),
        providers: listProviders(needsKey),
        view: runner.view(),
        lastCall: runner.lastCall,
        coachThread: runner.coachThread,
        chat: runner.chat
      }
    },
    'settings.update': async (patch) => {
      const s = await updateSettings(patch)
      runner.broadcast()
      return s
    },
    'lobby.update': (patch) => updateLobby(patch),
    'persona.setPrompt': (id, prompt) => setPrompt(id, prompt),
    'persona.resetPrompt': (id) => resetPrompt(id),
    'provider.save': async (input) => {
      const p = await saveProvider(input)
      if (input.apiKey?.trim()) clearNeedsKey(p.id)
      return { ...p, needsKey: needsKey.has(p.id) }
    },
    'provider.delete': async (id) => {
      await deleteProvider(id)
      clearNeedsKey(id)
    },
    'provider.test': ({ providerId, modelId }) => testProvider(providerId, modelId),
    'provider.registry': () => [
      ...Object.entries(PROVIDER_REGISTRY).map(([kind, v]) => ({ kind, name: v.name, models: [...v.models] })),
      { kind: 'openai-compatible', name: 'OpenAI 兼容接口', models: [] }
    ],
    'table.start': (o) => runner.start(o),
    'table.heroAct': (a) => runner.heroAct(a),
    'table.nextHand': () => runner.nextHand(),
    'table.rebuy': () => runner.rebuy(),
    'table.leave': () => runner.leave(),
    'table.resume': () => runner.resume(),
    'table.retryModels': () => runner.retryModels(),
    'chat.send': (text) => runner.sendChat(text),
    'coach.ask': (id, text) => runner.ask(id, text),
    'hands.list': () => listHands(),
    'hands.get': async (id) => {
      const record = await getHand(id)
      if (!record) return null
      const review = await getReview(id)
      return { record, ...(review !== null && { review }) }
    },
    'hands.review': (id) => void runner.review(id),
    'data.clearHistory': async () => {
      await clearHistory()
      runner.bankroll = await getBankroll()
      runner.emit('bankroll', runner.bankroll)
      runner.emit('hands:changed', undefined)
    },
    'data.resetMemory': async () => {
      if (runner.game) throw new Error('请先离桌')
      // 离桌后剩余的 durable 写入与在途调用结束后再重置，否则会被写回
      await runner.idleAll()
      await resetMemories()
    },
    'onboarding.done': () => setOnboarded(true)
  }
}

export function registerIpc(ipc: Pick<IpcMain, 'handle'>, runner: TableRunner) {
  for (const [channel, fn] of Object.entries(commandHandlers(runner))) {
    ipc.handle(channel, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
  }
}

// 有桌时退出先按离桌结算：余额写库完成后再真正退出
export function guardQuit(app: Pick<App, 'on' | 'quit'>, runner: TableRunner) {
  let leaving = false
  app.on('before-quit', (e) => {
    // 离桌时 game 已同步置空，但余额可能还没写完：期间再次退出也要拦下
    if (leaving) return e.preventDefault()
    if (!runner.game) return
    e.preventDefault()
    leaving = true
    void runner.leave().finally(() => {
      leaving = false
      app.quit()
    })
  })
}
