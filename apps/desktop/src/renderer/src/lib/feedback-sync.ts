import type { Bootstrap, TableFeedback, TableView, TableViewUpdate } from '../../../shared/types'

type Message = { kind: 'view'; value: TableViewUpdate } | { kind: 'feedback'; value: TableFeedback }

/** Keep initial snapshots and live feedback on the same ordered stream. */
export class FeedbackSync {
  private ready = false
  private pending: Message[] = []
  private revision = -1
  private current: TableView | null = null
  private seq = 0
  constructor(private readonly hooks: {
    view: (view: TableView | null) => void
    feedback: (event: TableFeedback) => void
    now?: () => number
  }) {}

  view(value: TableViewUpdate) {
    if (!this.ready) {
      this.pending.push({ kind: 'view', value })
      return
    }
    if (value.revision <= this.revision) return
    this.revision = value.revision
    if (value.view?.tableId !== this.current?.tableId) this.seq = 0
    this.current = value.view
    this.hooks.view(value.view)
  }

  feedback(value: TableFeedback) {
    if (!this.ready) {
      this.pending.push({ kind: 'feedback', value })
      return
    }
    if (!this.current || value.tableId !== this.current.tableId || value.seq <= this.seq) return
    this.seq = value.seq
    if (value.handNo !== this.current.handNo || (this.hooks.now?.() ?? Date.now()) - value.at > 1000) return
    this.hooks.feedback(value)
  }

  seed(snapshot: Pick<Bootstrap, 'view' | 'viewRevision' | 'feedback'>) {
    this.revision = snapshot.viewRevision
    this.current = snapshot.view
    this.seq = snapshot.feedback.tableId === snapshot.view?.tableId ? snapshot.feedback.seq : 0
    this.ready = true
    this.hooks.view(snapshot.view)
    const messages = this.pending
    this.pending = []
    for (const message of messages) {
      if (message.kind === 'view') this.view(message.value)
      else this.feedback(message.value)
    }
  }
}
