import type { Action } from '../engine/poker'

export interface IntentCollector {
  act?: Action
  say?: { text: string; kind: 'free' | 'reply'; replyTo?: string }
  hint?: string
  pause?: string
}

export function recordIntent<K extends keyof IntentCollector>(c: IntentCollector, key: K, value: NonNullable<IntentCollector[K]>) {
  if (c[key] === undefined) c[key] = value
}

export function coachAlert(c: IntentCollector): { level: 'pause' | 'hint'; message: string } | undefined {
  if (c.pause) return { level: 'pause', message: c.pause }
  if (c.hint) return { level: 'hint', message: c.hint }
}
