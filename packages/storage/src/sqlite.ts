import type { Client } from '@libsql/client'
import type { BootstrapReceipt, CommandReceipt, RoomCommit, RoomRecord, RoomState, RoomStore } from './room'

/** Shared by the WS host and Electron's local host. */
export class SqliteRoomStore implements RoomStore {
  private healthy = true
  private writes: Promise<unknown> = Promise.resolve()
  constructor(private readonly client: Client) {}
  isHealthy(): boolean {
    return this.healthy
  }

  async initialize(): Promise<void> {
    await this.client.execute('PRAGMA journal_mode=WAL')
    await this.client.execute('PRAGMA synchronous=FULL')
    await this.client.execute(
      'CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, closed_at INTEGER)'
    )
    await this.client.execute(
      'CREATE TABLE IF NOT EXISTS receipts (controller_id TEXT NOT NULL, command_id TEXT NOT NULL, room_id TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(controller_id,command_id))'
    )
  }

  private async read<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error) {
      this.healthy = false
      throw error
    }
  }

  async loadActive(): Promise<RoomRecord[]> {
    const result = await this.read(() => this.client.execute('SELECT snapshot FROM rooms WHERE closed_at IS NULL'))
    return result.rows.map((row) => this.record(String(row.snapshot)))
  }

  async load(roomId: string): Promise<RoomRecord | null> {
    const result = await this.read(() =>
      this.client.execute({ sql: 'SELECT snapshot FROM rooms WHERE id=?', args: [roomId] })
    )
    return result.rows[0] ? this.record(String(result.rows[0].snapshot)) : null
  }

  private record(json: string): RoomRecord {
    const snapshot = JSON.parse(json) as RoomState
    return {
      roomId: snapshot.roomId,
      version: snapshot.version,
      phase: snapshot.phase,
      snapshot,
      updatedAt: 0,
      closedAt: snapshot.closedAt
    }
  }

  async findCommand(roomId: string, controllerId: string, commandId: string): Promise<CommandReceipt | null> {
    return this.receipt('command', controllerId, commandId, roomId)
  }

  async findBootstrap(controllerId: string, commandId: string): Promise<BootstrapReceipt | null> {
    return this.receipt('bootstrap', controllerId, commandId)
  }

  private async receipt<T>(kind: string, controllerId: string, commandId: string, roomId?: string): Promise<T | null> {
    const result = await this.read(() =>
      this.client.execute({
        sql: 'SELECT room_id,data FROM receipts WHERE controller_id=? AND command_id=? AND kind=?',
        args: [controllerId, commandId, kind]
      })
    )
    const row = result.rows[0]
    return row && (!roomId || row.room_id === roomId) ? (JSON.parse(String(row.data)) as T) : null
  }

  commit(input: RoomCommit): Promise<void> {
    const task = this.writes.then(async () => {
      if (!this.healthy) throw new Error('room storage unavailable; restart the host')
      const tx = await this.client.transaction('write')
      try {
        const state = input.nextState
        await tx.execute({
          sql: 'INSERT INTO rooms VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot,closed_at=excluded.closed_at',
          args: [state.roomId, JSON.stringify(state), state.closedAt]
        })
        for (const [kind, receipt] of [
          ['command', input.receipt],
          ['bootstrap', input.bootstrapReceipt]
        ] as const) {
          if (receipt)
            await tx.execute({
              sql: 'INSERT INTO receipts VALUES(?,?,?,?,?)',
              args: [receipt.controllerId, receipt.commandId, state.roomId, kind, JSON.stringify(receipt)]
            })
        }
        await tx.commit()
      } catch (error) {
        await tx.rollback()
        throw error
      }
    })
    this.writes = task.catch(() => {
      this.healthy = false
    })
    return task
  }

  async cleanupClosed(before: number): Promise<void> {
    await this.client.batch(
      [
        { sql: 'DELETE FROM receipts WHERE room_id IN (SELECT id FROM rooms WHERE closed_at<?)', args: [before] },
        { sql: 'DELETE FROM rooms WHERE closed_at<?', args: [before] }
      ],
      'write'
    )
  }
}
