import type { BootstrapCommand, BoundCommand, Hello } from '@river/protocol'
export type ClientMessage = Hello | BootstrapCommand | BoundCommand
export interface Transport {
  open(onMessage: (message: unknown) => void, onClose: (info: CloseInfo) => void): Promise<void>
  send(message: ClientMessage): void
  close(): void
}
export interface CloseInfo {
  code: number
  reason: string
}

export function webSocketTransport(url: string): Transport {
  let socket: WebSocket | undefined
  return {
    open(onMessage, onClose) {
      return new Promise((resolve, reject) => {
        const next = new WebSocket(url)
        socket = next
        next.onopen = () => resolve()
        next.onerror = () => reject(new Error('无法连接牌局服务'))
        next.onmessage = (event) => {
          if (socket === next) onMessage(JSON.parse(String(event.data)))
        }
        next.onclose = (event) => {
          if (socket === next) onClose({ code: event.code, reason: event.reason })
        }
      })
    },
    send(message) {
      if (socket?.readyState !== WebSocket.OPEN) throw new Error('连接已断开')
      socket.send(JSON.stringify(message))
    },
    close() {
      const old = socket
      socket = undefined
      old?.close()
    }
  }
}
