import type { App, IpcMain } from 'electron'
import { PROVIDER_REGISTRY } from '@mastra/core/llm'
import { dict } from '@river/i18n'
import type { Commands, FxRates, Recap } from '../shared/types'
import {
  clearHistory, clearMemory, completeOnboarding, deletePersona, deleteProvider, getBankroll, getHand, getLobby, handKeyOf, listUsage, getOnboarded, getReview, getSettings, listHands,
  listProviders, personasCache, resetPersona, resetUsage, restorePersona, saveProvider, savePersona, settingsCache, updateLobby, updateSettings
} from './db'
import { costTotal, usageSummary } from './models/prices'
import { clearNeedsKey, needsKey, testProvider } from './models/resolve'
import type { TableRunner } from './table/runner'

type Handlers = { [K in keyof Commands]: (...args: Parameters<Commands[K]>) => ReturnType<Commands[K]> | Promise<ReturnType<Commands[K]>> }

export interface AppInfo {
  version: () => string
  update: () => string | null
  install: () => void
  fx: () => FxRates | null
  packaged: boolean
}

// 旧版本存的是纯文本复盘，新版本存 JSON
function parseReview(text: string): Recap | string {
  try {
    const r = JSON.parse(text)
    if (r && typeof r.headline === 'string') return r as Recap
  } catch {
    // 纯文本
  }
  return text
}

export function commandHandlers(runner: TableRunner, app: AppInfo = { version: () => '0.0.0', update: () => null, install: () => {}, fx: () => null, packaged: false }): Handlers {
  const personasChanged = () => runner.emit('personas', personasCache)
  const err = () => dict(settingsCache.locale).desktop.error
  return {
    'app.bootstrap': async () => ({
      settings: getSettings(),
      lobby: getLobby(),
      bankroll: runner.bankroll,
      onboarded: await getOnboarded(),
      personas: personasCache,
      providers: listProviders(needsKey),
      view: runner.view(),
      coachThread: runner.coachThread,
      chat: runner.chat,
      version: app.version(),
      update: app.update(),
      fx: app.fx(),
      packaged: app.packaged
    }),
    'settings.update': async (patch) => {
      if ('locale' in patch) throw new Error('locale is fixed after onboarding')
      const s = await updateSettings(patch)
      runner.broadcast()
      return s
    },
    'lobby.update': (patch) => updateLobby(patch),
    'persona.save': async (input) => {
      const p = await savePersona(input)
      personasChanged()
      return p
    },
    'persona.delete': async (id) => {
      if (personasCache.filter((p) => !p.deleted && p.id !== id).length < 1) throw new Error(err().keepOne)
      await deletePersona(id)
      const lb = getLobby()
      if (lb.picks.includes(id)) await updateLobby({ picks: lb.picks.filter((x) => x !== id) })
      personasChanged()
    },
    'persona.restore': async (id) => {
      await restorePersona(id)
      personasChanged()
    },
    'persona.reset': async (id) => {
      await resetPersona(id)
      personasChanged()
    },
    'provider.save': async (input) => {
      const p = await saveProvider(input)
      if (input.apiKey?.trim()) clearNeedsKey(p.id)
      return { ...p, needsKey: needsKey.has(p.id) }
    },
    'provider.delete': async (id) => {
      await deleteProvider(id)
      clearNeedsKey(id)
      // 引用它的角色模型会一并清空
      return getSettings()
    },
    'provider.test': ({ providerId, modelId }) => testProvider(providerId, modelId),
    'provider.registry': () => [
      ...Object.entries(PROVIDER_REGISTRY).map(([kind, v]) => ({ kind, name: v.name, models: [...v.models] })),
      { kind: 'openai-compatible', name: err().compatibleName, models: [] }
    ],
    'table.start': (o) => runner.start(o),
    'table.heroAct': (a) => runner.heroAct(a),
    'table.nextHand': () => runner.nextHand(),
    'table.rebuy': () => runner.rebuy(),
    'table.leave': () => runner.leave(),
    'table.retry': () => runner.retry(),
    'coach.ask': (text) => runner.ask(text),
    'coach.skip': () => runner.skip(),
    'coach.retry': () => runner.retryCoach(),
    'hands.list': () => listHands(),
    'hands.get': async (id) => {
      const record = await getHand(id)
      if (!record) return null
      const review = await getReview(id)
      const key = await handKeyOf(id)
      const rows = key ? (await listUsage()).filter((u) => u.tableId === key.tableId && u.handNo === key.handNo) : []
      return { record, ...(review !== null && { review: parseReview(review) }), ...(rows.length && { cost: costTotal(rows) }) }
    },
    'hands.review': (id) => void runner.review(id),
    'usage.summary': () => usageSummary(),
    'usage.reset': async () => {
      await resetUsage()
      runner.emit('usage:changed', undefined)
    },
    'data.clearHistory': async () => {
      await clearHistory()
      runner.bankroll = await getBankroll()
      runner.emit('bankroll', runner.bankroll)
      runner.emit('hands:changed', undefined)
    },
    'data.resetMemory': () => clearMemory(),
    'onboarding.done': (locale) => completeOnboarding(locale),
    'update.install': () => {
      if (runner.table) throw new Error(err().leaveFirst)
      app.install()
    }
  }
}

export function registerIpc(ipc: Pick<IpcMain, 'handle'>, runner: TableRunner, app?: AppInfo) {
  for (const [channel, fn] of Object.entries(commandHandlers(runner, app))) {
    ipc.handle(channel, (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
  }
}

// 有桌时退出先按离桌结算：余额写库完成后再真正退出
export function guardQuit(app: Pick<App, 'on' | 'quit'>, runner: TableRunner) {
  let leaving = false
  app.on('before-quit', (e) => {
    // 离桌时 table 已同步置空，但余额可能还没写完：期间再次退出也要拦下
    if (leaving) return e.preventDefault()
    if (!runner.table) return
    e.preventDefault()
    leaving = true
    void runner.leave().finally(() => {
      leaving = false
      app.quit()
    })
  })
}
