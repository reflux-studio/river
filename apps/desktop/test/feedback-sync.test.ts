import { describe, expect, it } from 'vitest'
import { FeedbackSync } from '../src/renderer/src/lib/feedback-sync'
import type { TableFeedback, TableView } from '../src/shared/types'

const view = (tableId = 'a', handNo = 1) => ({ tableId, handNo }) as TableView
const event = (seq: number, tableId = 'a', handNo = 1, at = 10_000): TableFeedback => ({ tableId, handNo, seq, at, kind: 'check' })
const setup = () => {
  const views: (TableView | null)[] = [], sounds: TableFeedback[] = []
  const sync = new FeedbackSync({ view: (v) => views.push(v), feedback: (e) => sounds.push(e), now: () => 10_000 })
  return { sync, views, sounds }
}

describe('initial snapshot and live table feedback', () => {
  it('does not roll a newer bootstrap back to an older buffered view or replay old sounds', () => {
    const { sync, views, sounds } = setup()
    sync.view({ revision: 2, view: view() })
    sync.feedback(event(1))
    sync.seed({ view: view('a', 2), viewRevision: 3, feedback: { tableId: 'a', seq: 4 } })
    expect(views).toEqual([view('a', 2)])
    expect(sounds).toEqual([])
  })

  it('keeps a post-snapshot leave and refuses its late feedback', () => {
    const { sync, views, sounds } = setup()
    sync.view({ revision: 4, view: null })
    sync.feedback(event(5))
    sync.seed({ view: view(), viewRevision: 3, feedback: { tableId: 'a', seq: 4 } })
    expect(views.at(-1)).toBeNull()
    expect(sounds).toEqual([])
  })

  it('plays first-hand feedback for a fresh table and deduplicates by that table sequence', () => {
    const { sync, sounds } = setup()
    sync.seed({ view: null, viewRevision: 0, feedback: { tableId: null, seq: 0 } })
    sync.view({ revision: 1, view: view() })
    sync.feedback(event(1))
    sync.feedback(event(1))
    sync.feedback(event(2))
    expect(sounds.map((e) => e.seq)).toEqual([1, 2])
  })

  it('uses a new table sequence without accepting old table or old hand events', () => {
    const { sync, sounds } = setup()
    sync.seed({ view: view(), viewRevision: 3, feedback: { tableId: 'a', seq: 99 } })
    sync.view({ revision: 4, view: view('b', 2) })
    sync.feedback(event(100, 'a'))
    sync.feedback(event(1, 'b', 1))
    sync.feedback(event(2, 'b', 2))
    sync.view({ revision: 3, view: view() })
    expect(sounds).toEqual([event(2, 'b', 2)])
  })

  it('advances the watermark even when expired feedback is skipped', () => {
    const { sync, sounds } = setup()
    sync.seed({ view: view(), viewRevision: 0, feedback: { tableId: 'a', seq: 0 } })
    sync.feedback(event(1, 'a', 1, 8_999))
    sync.feedback(event(1))
    sync.feedback(event(2))
    expect(sounds).toEqual([event(2)])
  })
})
