import { useState } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { finishOnboarding, go, modelOf, setState, startGuided, useRiver, type RiverState } from '@/lib/river'
import { cn } from '@/lib/utils'

const PAGES = [
  { t: '欢迎来到 River', b: '桌上只有你和 AI。每位对手都有自己的性格，轮到自己时会随行动说一句。教练站在你这边，只看你能看到的牌，随时可以问。' },
  { t: '目标：用 5 张牌比大小', b: '每人发 2 张只有自己能看的底牌，桌面陆续翻开 5 张公共牌。用这 7 张里任意 5 张组成最大的牌型；或者靠下注让其他人全部弃牌，也能直接赢下底池。' },
  { t: '牌型大小', b: '从大到小，上面的牌型永远大于下面的：' },
  { t: '一手牌的流程', b: '每手牌由两位玩家先放盲注，然后分四轮下注：' },
  { t: '教练和概率', b: '右侧会一直显示你的胜率和"所需胜率"（底池赔率）。胜率高于所需，跟注长期来看就是赚的。开桌时选“教练局”，每次轮到你教练都会先说说局面，一手结束还会复盘，并亮出所有人的底牌；你也可以随时提问，提问时牌局会暂停。' },
  { t: '配置模型', b: '对手和教练由大模型驱动。在设置里添加一个模型提供方，再分别为对手和教练选择模型。自由局需要对手模型，教练局还需要教练模型。' }
]

const RANKS = [
  ['皇家同花顺', 'A♠ K♠ Q♠ J♠ 10♠'], ['同花顺', '9♥ 8♥ 7♥ 6♥ 5♥'], ['四条', 'Q Q Q Q 3'], ['葫芦', 'K K K 7 7'],
  ['同花', 'A♦ J♦ 8♦ 4♦ 2♦'], ['顺子', '10 9 8 7 6'], ['三条', '8 8 8 K 2'], ['两对', 'J J 4 4 A'], ['一对', '10 10 K 6 3'], ['高牌', 'A J 8 5 2']
]
const FLOW = ['盲注', '翻牌前 · 2 张底牌', '翻牌 · 3 张', '转牌 · 1 张', '河牌 · 1 张', '摊牌']
const ACTS = [
  ['过牌', '没人下注时，不花钱继续'], ['下注', '率先投入筹码'], ['跟注', '补齐到当前下注额'],
  ['加注', '在别人的下注上再加'], ['弃牌', '放弃这手牌和已投入的筹码'], ['全下', '把剩余筹码全部推入']
]

const pill = 'h-auto rounded-full px-4 py-[9px] text-sm font-normal'

function modelLabel(s: RiverState, role: 'opponent' | 'coach') {
  const m = modelOf(s, role)
  return m ? `${m.provider.name} · ${m.modelId}` : '未配置'
}

function Pages() {
  const [i, setI] = useState(0)
  const opp = useRiver((s) => modelLabel(s, 'opponent'))
  const coach = useRiver((s) => modelLabel(s, 'coach'))
  const pg = PAGES[i]
  const last = i === PAGES.length - 1

  return (
    <>
      <div className="flex items-center">
        <span className="text-[13px] whitespace-nowrap text-muted-foreground">规则入门 · {i + 1} / {PAGES.length}</span>
        <div className="flex-1" />
        <button onClick={finishOnboarding} className="text-[13px] text-muted-foreground">跳过</button>
      </div>
      <DialogTitle className="text-2xl font-semibold tracking-[-0.01em]">{pg.t}</DialogTitle>
      <DialogDescription className="text-[15px] leading-[1.7] text-pretty text-[#3a3a3c]">{pg.b}</DialogDescription>

      {i === 2 && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-1">
          {RANKS.map(([n, ex], k) => (
            <div key={n} className="flex items-center gap-2.5 border-b border-divider py-[5px] text-[13px]">
              <span className="w-4 text-[#a1a1a6]">{k + 1}</span>
              <span className="w-[74px] font-semibold">{n}</span>
              <span className="whitespace-nowrap text-label">{ex}</span>
            </div>
          ))}
        </div>
      )}
      {i === 3 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FLOW.map((f) => (
              <span key={f} className="rounded-full bg-divider px-[11px] py-[5px] text-[13px] whitespace-nowrap">{f}</span>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ACTS.map(([n, d]) => (
              <div key={n} className="text-[13px] leading-normal">
                <b className="font-semibold">{n}</b> <span className="text-label">{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {last && (
        <div className="flex flex-col rounded-xl border px-4 py-1 text-[13px]">
          {[['对手模型', opp], ['教练模型', coach]].map(([l, v]) => (
            <div key={l} className="flex items-center gap-3 border-b border-divider py-2 last:border-0">
              <span className="w-16 font-semibold">{l}</span>
              <span className={cn('min-w-0 flex-1 truncate', v === '未配置' ? 'text-muted-foreground' : 'text-win')}>{v}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2.5 pt-1.5">
        <div className="flex gap-1.5">
          {PAGES.map((_, k) => (
            <span key={k} className={cn('size-[7px] rounded-full', k === i ? 'bg-foreground' : 'bg-[#dcdcd8]')} />
          ))}
        </div>
        <div className="flex-1" />
        {i > 0 && (
          <Button variant="outline" className={pill} onClick={() => setI(i - 1)}>上一步</Button>
        )}
        {!last && (
          <Button className={cn(pill, 'px-[18px]')} onClick={() => setI(i + 1)}>下一步</Button>
        )}
        {last && (
          <>
            <Button variant="outline" className={pill} onClick={finishOnboarding}>稍后再说</Button>
            <Button variant="outline" className={pill} onClick={() => { void finishOnboarding(); go('settings') }}>去配置</Button>
            <Button className={cn(pill, 'px-[18px]')} onClick={() => { void finishOnboarding(); void startGuided() }}>带我打一手</Button>
          </>
        )}
      </div>
    </>
  )
}

export function Onboarding() {
  const open = useRiver((s) => s.rulesOpen)
  return (
    <Dialog open={open} onOpenChange={(o) => !o && finishOnboarding()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100%-40px)] w-[580px] max-w-[calc(100%-40px)] flex-col gap-[18px] overflow-auto rounded-[20px] px-8 pt-[30px] pb-6 shadow-[0_30px_80px_rgba(0,0,0,0.18)] ring-0 sm:max-w-[580px]"
      >
        <Pages />
      </DialogContent>
    </Dialog>
  )
}

// 入座被拦下：缺对手模型或教练模型时引导去设置（discussion §9）
export function NeedModelDialog() {
  const need = useRiver((s) => s.needModel)
  const close = () => setState({ needModel: null })
  return (
    <AlertDialog open={need !== null} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-semibold">{need === 'coach' ? '教练模型还没有配置' : '对手模型还没有配置'}</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">
            {need === 'coach'
              ? '教练局靠教练每步讲解、每手复盘。先在设置里为教练选一个模型；或者回到大厅改开自由局。'
              : '对手由大模型驱动。先在设置里添加模型提供方，并为对手选一个模型。'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">取消</AlertDialogCancel>
          <AlertDialogAction className="rounded-full" onClick={() => go('settings')}>去设置</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
