import { Toaster } from '@/components/ui/sonner'
import { GuidedDialog, Onboarding } from '@/components/Onboarding'
import { TopBar } from '@/components/TopBar'
import { useRiver, type Page } from '@/lib/river'
import { Lobby } from '@/pages/Lobby'
import { Opponents } from '@/pages/Opponents'
import { Replays } from '@/pages/Replays'
import { Settings } from '@/pages/Settings'
import { Stats } from '@/pages/Stats'
import { Table } from '@/pages/Table'

const PAGES: Record<Page, React.ComponentType> = { lobby: Lobby, table: Table, opponents: Opponents, replays: Replays, stats: Stats, settings: Settings }

export function App() {
  const ready = useRiver((s) => s.ready)
  const hasTable = useRiver((s) => s.view !== null)
  const want = useRiver((s) => s.page)
  const page = want === 'table' && !hasTable ? 'lobby' : want
  const Page = PAGES[page]

  return (
    <>
      <div className="flex h-full min-w-[880px] flex-col overflow-hidden">
        <TopBar page={page} />
        <main className="flex min-h-0 flex-1 flex-col">{ready && <Page />}</main>
      </div>
      <Onboarding />
      <GuidedDialog />
      <Toaster position="top-center" />
    </>
  )
}
