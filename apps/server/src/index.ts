import { createClient } from '@libsql/client'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { BootstrapCommandSchema, HelloSchema, ProtocolOutputSchema, WelcomeSchema } from '@river/protocol'
import { RoomRuntime, type Clock } from '@river/runtime'
import { WebSocketServer, WebSocket } from 'ws'
import { SqliteRoomStore } from '@river/storage/sqlite'

const port = Number(process.env.PORT ?? 8787)
const dataDir = resolve(process.env.RIVER_DATA_DIR ?? './data')
mkdirSync(dataDir, { recursive: true })
const databaseUrl = pathToFileURL(join(dataDir, 'rooms.db')).href
const client = createClient({ url: databaseUrl })
const store = new SqliteRoomStore(client)
const sockets = new Map<string, Set<WebSocket>>()
const bindings = new WeakMap<WebSocket, { roomId: string; controllerId: string; generation: number }>()
const lastAuthenticatedAt = new WeakMap<WebSocket, number>()
const serverEpoch = randomUUID()
const clock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
}
let ready = false
let cleanup: ReturnType<typeof setInterval> | undefined

const runtime = new RoomRuntime({
  store,
  clock,
  random: { nextUint32: () => randomBytes(4).readUInt32BE(0) },
  id: randomUUID,
  hash: (value) => createHash('sha256').update(value).digest('hex'),
  serverEpoch,
  deliver: (projections) => {
    if (!store.isHealthy()) return
    for (const projection of projections) {
      const peers = sockets.get(projection.controllerId)
      if (!peers) continue
      for (const peer of peers) {
        const binding = bindings.get(peer)
        if (binding?.roomId === projection.roomId && binding.generation === projection.sessionGeneration)
          send(peer, projection)
      }
    }
  }
})

const webRoot = resolve(process.env.RIVER_WEB_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url)))
const server = createServer(async (req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end('{"status":"ok"}')
    return
  }
  if (req.url === '/readyz') {
    const status = ready && runtime.isReady() && store.isHealthy()
    res.writeHead(status ? 200 : 503, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: status ? 'ready' : 'not_ready' }))
    return
  }
  if (req.url?.startsWith('/play')) {
    try {
      const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/play\/?/, '')
      const file = resolve(webRoot, relative || 'index.html')
      if (!file.startsWith(webRoot + '/') && file !== join(webRoot, 'index.html')) {
        res.writeHead(403)
        res.end()
        return
      }
      let payload: Buffer
      let path = file
      try {
        payload = await readFile(path)
      } catch {
        path = join(webRoot, 'index.html')
        payload = await readFile(path)
      }
      const mime: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
      }
      res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream' })
      res.end(payload)
    } catch {
      res.writeHead(404)
      res.end('Build the Web app first: pnpm build:web')
    }
    return
  }
  res.writeHead(404)
  res.end()
})
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
server.on('upgrade', (request, socket, head) => {
  if (!ready || !store.isHealthy()) {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
    socket.destroy()
    return
  }
  if (request.url !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
    socket.destroy()
    return
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request))
})

wss.on('connection', (ws) => {
  const connectionId = randomUUID()
  let greeted = false
  let closed = false
  const helloTimeout = setTimeout(() => ws.close(4000, 'hello timeout'), 5_000)
  let bindTimeout: ReturnType<typeof setTimeout> | undefined
  lastAuthenticatedAt.set(ws, clock.now())
  ws.on('pong', () => {
    if (bindings.has(ws)) lastAuthenticatedAt.set(ws, clock.now())
  })
  ws.send(
    JSON.stringify(
      WelcomeSchema.parse({ kind: 'welcome', protocol: 1, connectionId, serverAt: clock.now(), heartbeatMs: 10_000 })
    )
  )
  let messageQueue = Promise.resolve()
  ws.on('message', (data) => {
    messageQueue = messageQueue
      .then(async () => {
        if (closed) return
        if (!ready || !store.isHealthy()) {
          send(ws, { kind: 'reject', code: 'STORE_UNAVAILABLE', retryable: true })
          ws.close(1011, 'storage unavailable')
          return
        }
        try {
          const raw: unknown = JSON.parse(data.toString())
          if (!greeted) {
            if (
              typeof raw === 'object' &&
              raw !== null &&
              'kind' in raw &&
              raw.kind === 'hello' &&
              'protocol' in raw &&
              raw.protocol !== 1
            ) {
              send(ws, { kind: 'reject', code: 'PROTOCOL_UNSUPPORTED', retryable: false })
              ws.close(4000, 'protocol unsupported')
              return
            }
            HelloSchema.parse(raw)
            greeted = true
            clearTimeout(helloTimeout)
            bindTimeout = setTimeout(() => {
              if (!bindings.has(ws)) ws.close(4000, 'bind timeout')
            }, 10_000)
            return
          }
          const bootstrap = BootstrapCommandSchema.safeParse(raw)
          if (bootstrap.success) {
            if (bindings.has(ws)) {
              send(ws, {
                kind: 'reject',
                code: 'INVALID_PHASE',
                retryable: false,
                detail: 'connection is already bound'
              })
              return
            }
            const message = bootstrap.data
            let result
            if (message.kind === 'room.create') result = await runtime.createRoom(message)
            else if (message.kind === 'room.join') result = await runtime.joinRoom(message)
            else if (message.kind === 'session.resume') result = await runtime.resume(message)
            else result = await runtime.authenticateArchive(message)
            if (result.kind === 'reject') {
              send(ws, result.reject)
              return
            }
            if (result.kind === 'bound') {
              if (bindTimeout) clearTimeout(bindTimeout)
              for (const old of sockets.get(result.bound.controllerId) ?? []) {
                if (old !== ws) old.close(4001, 'session resumed elsewhere')
              }
              sockets.set(result.bound.controllerId, new Set())
              bindings.set(ws, {
                roomId: result.bound.roomId,
                controllerId: result.bound.controllerId,
                generation: result.bound.sessionGeneration
              })
              addSocket(result.bound.controllerId, ws)
              lastAuthenticatedAt.set(ws, clock.now())
              send(ws, result.bound)
              send(ws, result.projection)
            }
            return
          }
          const binding = bindings.get(ws)
          if (!binding) {
            send(ws, {
              kind: 'reject',
              code: 'UNBOUND',
              retryable: false,
              detail: 'bind to a room before sending commands'
            })
            return
          }
          if (typeof raw !== 'object' || raw === null || !('roomId' in raw) || raw.roomId !== binding.roomId) {
            send(ws, { kind: 'reject', code: 'CONTROLLER_MISMATCH', retryable: false })
            return
          }
          lastAuthenticatedAt.set(ws, clock.now())
          const result = await runtime.submit(binding.controllerId, raw, binding.generation)
          if (result.kind === 'reject') send(ws, result.reject)
          else if (result.kind === 'ack') send(ws, result.ack)
        } catch (error) {
          if (!store.isHealthy()) {
            ws.close(1011, 'storage unavailable')
            return
          }
          if (error instanceof Error && 'code' in error && 'retryable' in error) {
            send(ws, { kind: 'reject', code: error.code, retryable: error.retryable, detail: error.message })
            return
          }
          send(ws, { kind: 'reject', code: 'INVALID_PAYLOAD', retryable: false, detail: 'invalid protocol message' })
        }
      })
      .catch(() => ws.close(1011, 'message processing failed'))
  })
  ws.on('close', () => {
    closed = true
    clearTimeout(helloTimeout)
    if (bindTimeout) clearTimeout(bindTimeout)
    const binding = bindings.get(ws)
    if (!binding) return
    sockets.get(binding.controllerId)?.delete(ws)
    if (!store.isHealthy()) return
    void runtime.connectionClosed(binding.roomId, binding.controllerId, binding.generation).catch(() => {
      ready = false
    })
  })
})

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (clock.now() - (lastAuthenticatedAt.get(ws) ?? 0) >= 30_000) {
      ws.terminate()
      continue
    }
    ws.ping()
  }
}, 10_000)

function send(ws: WebSocket, value: unknown): void {
  if (ws.bufferedAmount > 4 * 1024 * 1024) {
    ws.close(4002, 'slow consumer')
    return
  }
  const parsed = ProtocolOutputSchema.safeParse(value)
  if (!parsed.success || ws.readyState !== WebSocket.OPEN) return
  const payload = JSON.stringify(parsed.data)
  ws.send(payload)
}
function addSocket(controllerId: string, ws: WebSocket): void {
  const peers = sockets.get(controllerId) ?? new Set<WebSocket>()
  peers.add(ws)
  sockets.set(controllerId, peers)
}
async function main(): Promise<void> {
  await store.initialize()
  await runtime.cleanupClosed(clock.now() - 7 * 24 * 60 * 60 * 1000)
  await runtime.restore()
  ready = true
  server.listen(port, '0.0.0.0')
  cleanup = setInterval(
    () => void runtime.cleanupClosed(clock.now() - 7 * 24 * 60 * 60 * 1000).catch(() => undefined),
    6 * 60 * 60 * 1000
  )
  const shutdown = async () => {
    ready = false
    if (cleanup) clearInterval(cleanup)
    for (const ws of wss.clients) ws.close(1001, 'server shutting down')
    await new Promise<void>((resolve) => wss.close(() => resolve()))
    await new Promise<void>((resolve) => server.close(() => resolve()))
    clearInterval(heartbeat)
    await client.close()
  }
  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)))
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)))
}

void main().catch((error: unknown) => {
  ready = false
  console.error('server initialization failed', error instanceof Error ? error.message : 'unknown error')
  clearInterval(heartbeat)
  void client.close()
  process.exitCode = 1
})
