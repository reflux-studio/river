import type { Transport } from '@river/client'
import type { RoomView } from '@river/protocol'
export interface DesktopHost {
  localTransport(): Transport
  personas(): Promise<Array<{ id: string; name: string }>>
  provideAgent(input: {
    url: string
    roomId: string
    credential: { controllerId: string; resumeSecret: string }
    templateId: string
    buyIn: number
  }): Promise<void>
  coach(view: RoomView, question?: string): Promise<string>
}
