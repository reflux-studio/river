import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Confirm } from '@/components/Confirm'
import { ProviderDialog, useRegistry } from '@/components/ProviderDialog'
import { Segmented } from '@/components/Segmented'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  deleteProvider, invoke, openRules, testProvider, toastError, updateSettings, useRiver, type RiverState
} from '@/lib/river'
import { cn } from '@/lib/utils'
import { COACHES } from '../../../shared/personas'
import type { ProviderPublic, Settings as SettingsT } from '../../../shared/types'

type Role = 'opponent' | 'coach'
const ROLE_NAME: Record<Role, string> = { opponent: '对手', coach: '教练' }
const NONE = '__none'
const pillBtn = 'rounded-full border border-input bg-white px-3.5 py-1.5 text-[13px] whitespace-nowrap hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50'

const configured = (s: RiverState, role: Role) => {
  const m = s.settings.models[role]
  const p = m && s.providers.find((x) => x.id === m.providerId)
  return !!p && !p.needsKey
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="pl-1 text-[13px] text-muted-foreground">{title}</span>
      <div className="rounded-[14px] border bg-white px-[18px]">{children}</div>
    </div>
  )
}

function Row({ label, desc, children, below }: { label: string; desc?: ReactNode; children?: ReactNode; below?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-divider py-3.5 last:border-0">
      <div className="flex items-center gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{label}</span>
          {desc && <span className="text-xs leading-normal text-muted-foreground">{desc}</span>}
        </div>
        {children}
      </div>
      {below}
    </div>
  )
}

const testLabel = (p: ProviderPublic) =>
  p.supportsRequired === null ? '未测试' : p.supportsRequired ? '已测试 · 支持强制工具调用' : '已测试 · 工具调用降级为自动'

function Providers() {
  const providers = useRiver((s) => s.providers)
  const models = useRiver((s) => s.settings.models)
  const reg = useRegistry()
  const [dialog, setDialog] = useState<{ open: boolean; provider?: ProviderPublic }>({ open: false })

  return (
    <Group title="模型提供方">
      {!providers.length && (
        <Row label="还没有提供方" desc="添加一个模型提供方后，才能为对手和教练选择模型。" />
      )}
      {providers.map((p) => {
        const users = (Object.keys(ROLE_NAME) as Role[]).filter((r) => models[r]?.providerId === p.id)
        return (
          <Row
            key={p.id}
            label={p.name}
            desc={
              <>
                {reg.find((r) => r.kind === p.kind)?.name ?? p.kind}
                {p.baseUrl && ` · ${p.baseUrl}`}
                {' · '}
                {p.keyTail ? `已保存 ····${p.keyTail}` : '未设置 API key'}
                {' · '}
                {testLabel(p)}
                {p.needsKey && <span className="block text-lose">无法解密已保存的 API key，请点“编辑”重新输入。</span>}
              </>
            }
          >
            <button className={pillBtn} onClick={() => setDialog({ open: true, provider: p })}>编辑</button>
            <Confirm
              title={`删除提供方“${p.name}”？`}
              description={
                users.length
                  ? `${users.map((r) => ROLE_NAME[r]).join('和')}模型正在使用它，删除后对应的模型选择会被清空。`
                  : '删除后需要重新添加并输入 API key。'
              }
              action="删除"
              onConfirm={() => deleteProvider(p.id)}
            >
              <button className={cn(pillBtn, 'text-lose')}>删除</button>
            </Confirm>
          </Row>
        )
      })}
      <div className="flex py-3.5">
        <button className={pillBtn} onClick={() => setDialog({ open: true })}>添加提供方</button>
      </div>
      <ProviderDialog open={dialog.open} provider={dialog.provider} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
    </Group>
  )
}

type TestResult = Awaited<ReturnType<typeof testProvider>>

function ModelPicker({ role }: { role: Role }) {
  const providers = useRiver((s) => s.providers)
  const sel = useRiver((s) => s.settings.models[role])
  const reg = useRegistry()
  const [providerId, setProviderId] = useState(sel?.providerId ?? '')
  const [modelId, setModelId] = useState(sel?.modelId ?? '')
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  // 删除提供方等操作会在主进程清空选择，草稿要跟着变
  useEffect(() => {
    setProviderId(sel?.providerId ?? '')
    setModelId(sel?.modelId ?? '')
  }, [sel?.providerId, sel?.modelId])

  const save = (pid: string, mid: string) => {
    const next = pid && mid.trim() ? { providerId: pid, modelId: mid.trim() } : undefined
    if (next?.providerId === sel?.providerId && next?.modelId === sel?.modelId) return
    setResult(null)
    void updateSettings({ models: { [role]: next } })
  }

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      setResult(await testProvider(providerId, modelId.trim()))
    } catch (e) {
      setResult({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setTesting(false)
    }
  }

  if (!providers.length) return <span className="text-xs text-muted-foreground">先在上方添加模型提供方。</span>
  const kind = providers.find((p) => p.id === providerId)?.kind
  const suggestions = reg.find((r) => r.kind === kind)?.models ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Select
          value={providerId || NONE}
          onValueChange={(v) => {
            const pid = v === NONE ? '' : v
            setProviderId(pid)
            save(pid, modelId)
          }}
        >
          <SelectTrigger className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>不使用</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="min-w-0 flex-1"
          placeholder="模型 ID，例如 claude-sonnet-4-5"
          list={`models-${role}`}
          value={modelId}
          disabled={!providerId}
          onChange={(e) => setModelId(e.target.value)}
          onBlur={() => save(providerId, modelId)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <datalist id={`models-${role}`}>
          {suggestions.map((m) => <option key={m} value={m} />)}
        </datalist>
        <button className={pillBtn} disabled={!providerId || !modelId.trim() || testing} onClick={test}>
          {testing ? '测试中…' : '测试连接'}
        </button>
      </div>
      {testing && <span className="text-xs text-muted-foreground">正在调用模型，最长约 40 秒。</span>}
      {result && (
        <span className={cn('text-xs break-all', result.ok ? 'text-win' : 'text-lose')}>
          {result.ok
            ? `连接成功 · ${result.supportsRequired ? '支持强制工具调用' : '不支持强制工具调用，将改用自动模式'}`
            : `连接失败：${result.error ?? '未知错误'}`}
        </span>
      )}
    </div>
  )
}

function Seg<K extends 'speed' | 'coachPersona' | 'level' | 'engine'>({
  k, labels, values
}: {
  k: K
  labels: string[]
  values: SettingsT[K][]
}) {
  const v = useRiver((s) => s.settings[k])
  return (
    <Segmented
      value={v}
      options={labels.map((label, i) => ({ label, value: values[i] }))}
      onChange={(x) => updateSettings({ [k]: x } as Partial<SettingsT>)}
    />
  )
}

function Tog({ k }: { k: 'coachOn' | 'hard' | 'autoNext' }) {
  const v = useRiver((s) => s.settings[k])
  return <Switch checked={v} onCheckedChange={(x) => updateSettings({ [k]: x })} />
}

function Engine() {
  const ok = useRiver((s) => configured(s, 'opponent'))
  const engine = useRiver((s) => s.settings.engine)
  return (
    <Row
      label="决策引擎"
      desc={ok ? 'LLM 按性格提示词决策和说话；超时或出错时由本地引擎托管。' : '还没有配置对手模型，只能使用本地引擎。'}
    >
      <Segmented
        value={ok ? engine : 'local'}
        options={[
          { label: 'LLM', value: 'llm', disabled: !ok },
          { label: '本地引擎', value: 'local' }
        ]}
        onChange={(engine) => updateSettings({ engine })}
      />
    </Row>
  )
}

function Data() {
  const lastCall = useRiver((s) => s.lastCall)
  const view = useRiver((s) => s.view)
  const run = (cmd: 'data.clearHistory' | 'data.resetMemory', ok: string) =>
    invoke(cmd).then(() => toast.success(ok), toastError)

  return (
    <Group title="牌局与数据">
      <Row label="自动下一手" desc="一手结束 4 秒后自动发牌。">
        <Tog k="autoNext" />
      </Row>
      <Row label="最近调用" desc="最近一次对手或教练模型调用。">
        <span className="text-sm font-semibold whitespace-nowrap">
          {lastCall
            ? `${ROLE_NAME[lastCall.role]} · ${lastCall.modelId} · ${(lastCall.ms / 1000).toFixed(1)} 秒 · ${lastCall.ok ? '成功' : '失败'}`
            : '暂无'}
        </span>
      </Row>
      <Row label="本桌托管次数" desc="对手模型超时或出错时，由本地引擎代打并标“托管”。">
        <span className="text-sm font-semibold">{view ? `${view.autopilotCount} 次` : '未入座'}</span>
      </Row>
      <Row label="规则介绍" desc="重新看一遍首次进入时的规则卡片。">
        <button className={pillBtn} onClick={openRules}>打开</button>
      </Row>
      <Row label="清空记录" desc="清除手牌历史和统计，筹码重置为 100,000。">
        <Confirm
          title="清空全部记录？"
          description="手牌历史、统计和教练复盘都会被删除，筹码重置为 100,000。此操作无法撤销。"
          action="清空"
          onConfirm={() => run('data.clearHistory', '已清空记录')}
        >
          <button className={pillBtn}>清空</button>
        </Confirm>
      </Row>
      <Row
        label="重置 AI 记忆"
        desc={view ? '请先离桌，再重置 AI 记忆。' : '清除对手对你的印象和教练的学员档案。'}
      >
        <Confirm
          title="重置 AI 记忆？"
          description="对手对你的印象和教练的学员档案都会被清除，此操作无法撤销。"
          action="重置"
          onConfirm={() => run('data.resetMemory', '已重置 AI 记忆')}
        >
          <button className={pillBtn} disabled={!!view}>重置</button>
        </Confirm>
      </Row>
    </Group>
  )
}

export function Settings() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[760px] flex-col gap-[22px] px-8 pt-10 pb-16">
        <div className="text-[28px] font-semibold">设置</div>
        <Providers />
        <Group title="AI 对手">
          <Engine />
          <Row label="对手模型" desc="所有对手共用这个模型，各自按性格提示词行动。" below={<ModelPicker role="opponent" />} />
          <Row label="思考速度" desc="AI 行动前的停顿。">
            <Seg k="speed" labels={['慢', '中', '快']} values={[0, 1, 2]} />
          </Row>
        </Group>
        <Group title="教练">
          <Row label="教练模型" desc="未配置时教练栏不可用，概率面板照常显示。" below={<ModelPicker role="coach" />} />
          <Row label="主动提醒" desc="每次轮到你时，教练自己判断是保持沉默、提醒你，还是暂停牌局。">
            <Tog k="coachOn" />
          </Row>
          <Row label="人设" desc="教练说话的风格。">
            <Seg k="coachPersona" labels={COACHES.map((c) => c.n)} values={[0, 1, 2]} />
          </Row>
          <Row label="讲解深度" desc="新手模式会解释术语；进阶模式会谈范围和 EV。">
            <Seg k="level" labels={['新手', '进阶']} values={['novice', 'pro']} />
          </Row>
          <Row label="硬核模式" desc="隐藏胜率、底池赔率和出路。">
            <Tog k="hard" />
          </Row>
        </Group>
        <Data />
      </div>
    </div>
  )
}
