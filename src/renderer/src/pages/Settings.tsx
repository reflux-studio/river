import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Confirm } from '@/components/Confirm'
import { ProviderDialog, useRegistry } from '@/components/ProviderDialog'
import { Segmented } from '@/components/Segmented'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { BackSwatches, FeltSwatches, FxSegment } from '@/components/Appearance'
import { deleteProvider, invoke, openRules, testProvider, toastError, updateSettings, useRiver } from '@/lib/river'
import { cn } from '@/lib/utils'
import { COACHES } from '../../../shared/personas'
import type { ProviderPublic, Settings as SettingsT } from '../../../shared/types'

type Role = 'opponent' | 'coach'
const ROLE_NAME: Record<Role, string> = { opponent: '对手', coach: '教练' }
const NONE = '__none'
const pillBtn = 'rounded-full border border-input bg-white px-3.5 py-1.5 text-[13px] whitespace-nowrap hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50'

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

function Seg<K extends 'speed' | 'coachPersona' | 'level'>({
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

function Tog({ k }: { k: 'hard' }) {
  const v = useRiver((s) => s.settings[k])
  return <Switch checked={v} onCheckedChange={(x) => updateSettings({ [k]: x })} />
}

function Currency() {
  const v = useRiver((s) => s.settings.currency)
  return (
    <Segmented<SettingsT['currency']>
      value={v}
      options={[{ label: '人民币', value: 'CNY' }, { label: '美元', value: 'USD' }]}
      onChange={(currency) => updateSettings({ currency })}
    />
  )
}

function UsdCny() {
  const cur = useRiver((s) => s.settings.currency)
  const rate = useRiver((s) => s.settings.usdCny)
  const [text, setText] = useState(String(rate))
  useEffect(() => setText(String(rate)), [rate])
  if (cur !== 'CNY') return null
  // 失焦时保存；非正数恢复原值
  const save = () => {
    const x = Number(text)
    if (x > 0 && x !== rate) void updateSettings({ usdCny: Math.round(x * 10000) / 10000 })
    else setText(String(rate))
  }
  return (
    <Row label="汇率" desc="只影响显示，统计按美元记录，改汇率后历史花费一并换算。">
      <span className="flex items-center gap-2 text-sm text-label">
        1 美元 =
        <Input value={text} inputMode="decimal" onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="h-8 w-20 rounded-[9px] border-input text-right shadow-none" />
        元
      </span>
    </Row>
  )
}

function Data() {
  const view = useRiver((s) => s.view)
  const version = useRiver((s) => s.version)
  const run = (cmd: 'data.clearHistory' | 'data.resetMemory', ok: string) =>
    invoke(cmd).then(() => toast.success(ok), toastError)

  return (
    <Group title="牌局与数据">
      <Row label="规则介绍" desc="重新看一遍首次进入时的规则卡片。">
        <button className={pillBtn} onClick={openRules}>打开</button>
      </Row>
      <Row label="清空记录" desc="清除手牌历史和复盘，筹码重置为 100,000。用量统计在“数据统计”里单独清零。">
        <Confirm
          title="清空全部记录？"
          description="手牌历史、统计和教练复盘都会被删除，筹码重置为 100,000。此操作无法撤销。"
          action="清空"
          onConfirm={() => run('data.clearHistory', '已清空记录')}
        >
          <button className={pillBtn}>清空</button>
        </Confirm>
      </Row>
      <Row label="重置 AI 记忆" desc="清除对手记下的印象和教练的学员档案。">
        <Confirm
          title="重置 AI 记忆？"
          description="对手记下的印象和教练的学员档案都会被清除，此操作无法撤销。"
          action="重置"
          onConfirm={() => run('data.resetMemory', '已重置 AI 记忆')}
        >
          <button className={pillBtn} disabled={!!view}>重置</button>
        </Confirm>
      </Row>
      <Row label="版本" desc="有新版本时会在后台下载，下载完在顶栏提示重启更新。">
        <span className="text-sm font-semibold">{version}</span>
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
          <Row label="对手模型" desc="所有对手共用这个模型，各自按性格提示词行动。开桌必需。" below={<ModelPicker role="opponent" />} />
          <Row label="思考速度" desc="AI 行动的最短停顿：模型返回太快时补足再落子。">
            <Seg k="speed" labels={['慢', '中', '快']} values={[0, 1, 2]} />
          </Row>
        </Group>
        <Group title="教练">
          <Row label="教练模型" desc="教练局需要它：每步讲解、提问与每手复盘。自由局不用。" below={<ModelPicker role="coach" />} />
          <Row label="人设" desc="教练说话的风格。">
            <Seg k="coachPersona" labels={COACHES.map((c) => c.n)} values={[0, 1, 2]} />
          </Row>
          <Row label="讲解深度" desc="新手模式会解释术语；进阶模式会谈范围和 EV。">
            <Seg k="level" labels={['新手', '进阶']} values={['novice', 'pro']} />
          </Row>
          <Row label="硬核模式" desc="教练局中隐藏胜率、底池赔率和出路。">
            <Tog k="hard" />
          </Row>
        </Group>
        <Group title="牌桌外观">
          <Row label="桌布" desc="五种预设，或点最后一个自选颜色。">
            <FeltSwatches size={24} />
          </Row>
          <Row label="牌背" desc="对手手牌背面的颜色。">
            <BackSwatches />
          </Row>
          <Row label="动效" desc="完整：发牌、筹码飞行、加注与全下特效；精简：只保留发牌、翻牌和气泡。">
            <FxSegment />
          </Row>
        </Group>
        <Group title="用量计价">
          <Row label="货币" desc="价格来自 models.dev（美元），选人民币时按下面的汇率换算。">
            <Currency />
          </Row>
          <UsdCny />
        </Group>
        <Data />
      </div>
    </div>
  )
}
