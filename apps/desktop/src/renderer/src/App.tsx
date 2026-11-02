import { Toaster } from '@/components/ui/sonner'
import { TopBar } from '@/components/TopBar'
import { useEffect, useState } from 'react'
import { useLangTag } from '@/lib/format'
import { useRiver } from '@/lib/river'
import { Opponents } from '@/pages/Opponents'
import { Replays } from '@/pages/Replays'
import { Settings } from '@/pages/Settings'
import { Stats } from '@/pages/Stats'
import { Online } from '@/pages/Online'
import { go } from '@/lib/river'

const PAGES = { opponents: Opponents, replays: Replays, stats: Stats, settings: Settings }

export function App() {
  const [online, setOnline] = useState(true)
  const ready = useRiver((s) => s.ready)
  const want = useRiver((s) => s.page)
  const lang = useLangTag()
  useEffect(() => void (document.documentElement.lang = lang), [lang])
  const page = want === 'table' || want === 'lobby' ? 'settings' : want
  const Page = PAGES[page]

  return (
    <>
      <div style={{ display: online ? 'block' : 'none' }}>
        <Online
          onSettings={() => {
            go('settings')
            setOnline(false)
          }}
        />
      </div>
      {!online && (
        <>
          <button
            className="fixed bottom-4 left-4 z-50 rounded-full bg-foreground px-4 py-2 text-white"
            onClick={() => setOnline(true)}
          >
            返回好友牌桌
          </button>
          <div className="flex h-full min-w-[880px] flex-col overflow-hidden">
            <TopBar page={page} />
            <main className="flex min-h-0 flex-1 flex-col">{ready && <Page />}</main>
          </div>
          <Toaster position="top-center" />
        </>
      )}
    </>
  )
}
