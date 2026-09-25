import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Confirm } from '@/components/Confirm'
import { ProviderDialog, useRegistry } from '@/components/ProviderDialog'
import { Segmented } from '@/components/Segmented'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { BackSwatches, FeltSwatches, FxSegment } from '@/components/Appearance'
import { deleteProvider, invoke, openRules, testProvider, toastError, updateSettings, useRiver, useT } from '@/lib/river'
import { rateText, useMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CURRENCIES } from '../../../shared/currency'
import type { Dict } from '@river/i18n'
import type { ProviderPublic, Settings as SettingsT } from '../../../shared/types'

type Role = 'opponent' | 'coach'
const ROLES: Role[] = ['opponent', 'coach']
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

const testLabel = (p: ProviderPublic, s: Dict['desktop']['settings']) =>
  p.supportsRequired === null ? s.untested : p.supportsRequired ? s.testedRequired : s.testedAuto

function Providers() {
  const providers = useRiver((s) => s.providers)
  const models = useRiver((s) => s.settings.models)
  const reg = useRegistry()
  const t = useT()
  const s = t.desktop.settings
  const [dialog, setDialog] = useState<{ open: boolean; provider?: ProviderPublic }>({ open: false })

  return (
    <Group title={s.providers}>
      {!providers.length && <Row label={s.noProviders} desc={s.noProvidersDesc} />}
      {providers.map((p) => {
        const users = ROLES.filter((r) => models[r]?.providerId === p.id)
        return (
          <Row
            key={p.id}
            label={p.name}
            desc={
              <>
                {reg.find((r) => r.kind === p.kind)?.name ?? p.kind}
                {p.baseUrl && ` · ${p.baseUrl}`}
                {' · '}
                {p.keyTail ? s.keySaved(p.keyTail) : s.noKey}
                {' · '}
                {testLabel(p, s)}
                {p.needsKey && <span className="block text-lose">{s.cantDecrypt}</span>}
              </>
            }
          >
            <button className={pillBtn} onClick={() => setDialog({ open: true, provider: p })}>{t.desktop.btn.edit}</button>
            <Confirm
              title={s.deleteTitle(p.name)}
              description={users.length ? s.deleteInUse(users.map((r) => s.roles[r]).join(s.roleSep)) : s.deleteDesc}
              action={t.desktop.btn.delete}
              onConfirm={() => deleteProvider(p.id)}
            >
              <button className={cn(pillBtn, 'text-lose')}>{t.desktop.btn.delete}</button>
            </Confirm>
          </Row>
        )
      })}
      <div className="flex py-3.5">
        <button className={pillBtn} onClick={() => setDialog({ open: true })}>{s.addProvider}</button>
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
  const s = useT().desktop.settings
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

  if (!providers.length) return <span className="text-xs text-muted-foreground">{s.addFirst}</span>
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
            <SelectItem value={NONE}>{s.noModel}</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          className="min-w-0 flex-1"
          placeholder={s.modelPh}
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
          {testing ? s.testing : s.test}
        </button>
      </div>
      {testing && <span className="text-xs text-muted-foreground">{s.testingHint}</span>}
      {result && (
        <span className={cn('text-xs break-all', result.ok ? 'text-win' : 'text-lose')}>
          {result.ok ? s.testOk(!!result.supportsRequired) : s.testFail(result.error ?? s.unknownError)}
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
  const names = useT().common.currency
  return (
    // 换币种时手动汇率作废，回到自动
    <Select value={v} onValueChange={(currency) => updateSettings({ currency: currency as SettingsT['currency'], fxRate: null })}>
      <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((c) => <SelectItem key={c.code} value={c.code}>{names[c.code]} · {c.code.toUpperCase()}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function FxRate() {
  const m = useMoney()
  const manual = useRiver((s) => s.settings.fxRate)
  const t = useT()
  const s = t.desktop.settings
  const [text, setText] = useState(rateText(m.rate))
  useEffect(() => setText(rateText(m.rate)), [m.rate])
  if (m.currency === 'usd') return null
  const unit = t.common.currencyUnit[m.currency]
  // 失焦时保存；非正数恢复原值
  const save = () => {
    const x = Number(text)
    if (x > 0 && x !== manual) void updateSettings({ fxRate: Math.round(x * 10000) / 10000 })
    else setText(rateText(m.rate))
  }
  const desc = m.source === 'auto' ? s.fxAuto(m.date ?? '') : m.source === 'approx' ? s.fxApprox : s.fxManual
  return (
    <Row label={s.fx} desc={desc + s.fxNote}>
      <span className="flex items-center gap-3 text-sm text-label">
        <Segmented
          value={manual ? 'manual' : 'auto'}
          options={[{ label: s.auto, value: 'auto' }, { label: s.manual, value: 'manual' }]}
          onChange={(x) => void updateSettings({ fxRate: x === 'auto' ? null : Number(rateText(m.rate)) })}
        />
        <span className="flex items-center gap-2 whitespace-nowrap">
          {s.oneUsd}
          {manual ? (
            <Input value={text} inputMode="decimal" onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className="h-8 w-20 rounded-[9px] border-input text-right shadow-none" />
          ) : (
            <span className="font-semibold text-foreground">{rateText(m.rate)}</span>
          )}
          {unit}
        </span>
      </span>
    </Row>
  )
}

function Data() {
  const view = useRiver((s) => s.view)
  const version = useRiver((s) => s.version)
  const packaged = useRiver((s) => s.packaged)
  const t = useT().desktop
  const s = t.settings
  const [checking, setChecking] = useState(false)
  const run = (cmd: 'data.clearHistory' | 'data.resetMemory', ok: string) =>
    invoke(cmd).then(() => toast.success(ok), toastError)
  const checkUpdate = () => {
    setChecking(true)
    invoke('update.check')
      .then((r) => {
        if (r.state === 'latest') toast.success(t.update.latest)
        else if (r.state === 'error') toast.error(r.message)
        else toast.success(r.state === 'ready' ? t.update.ready(r.version) : t.update.downloading(r.version))
      }, toastError)
      .finally(() => setChecking(false))
  }

  return (
    <Group title={s.data}>
      <Row label={s.rules} desc={s.rulesDesc}>
        <button className={pillBtn} onClick={openRules}>{s.open}</button>
      </Row>
      <Row label={s.clear} desc={s.clearDesc}>
        <Confirm title={s.clearTitle} description={s.clearConfirm} action={s.clearAction} onConfirm={() => run('data.clearHistory', s.cleared)}>
          <button className={pillBtn}>{s.clearAction}</button>
        </Confirm>
      </Row>
      <Row label={s.resetMemory} desc={s.resetMemoryDesc}>
        <Confirm title={s.resetMemoryTitle} description={s.resetMemoryConfirm} action={s.resetAction} onConfirm={() => run('data.resetMemory', s.resetDone)}>
          <button className={pillBtn} disabled={!!view}>{s.resetAction}</button>
        </Confirm>
      </Row>
      <Row label={s.version} desc={packaged ? s.versionDesc : t.update.devOnly}>
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold">{version}</span>
          <button className={pillBtn} disabled={!packaged || checking} onClick={checkUpdate}>{t.update.check}</button>
        </span>
      </Row>
    </Group>
  )
}

export function Settings() {
  const t = useT()
  const s = t.desktop.settings
  const a = t.desktop.appearance
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[760px] flex-col gap-[22px] px-8 pt-10 pb-16">
        <div className="text-[28px] font-semibold">{t.desktop.nav.settings}</div>
        <Providers />
        <Group title={t.desktop.nav.opponents}>
          <Row label={s.opponentModel} desc={s.opponentModelDesc} below={<ModelPicker role="opponent" />} />
          <Row label={s.speed} desc={s.speedDesc}>
            <Seg k="speed" labels={s.speeds} values={[0, 1, 2]} />
          </Row>
        </Group>
        <Group title={s.coach}>
          <Row label={s.coachModel} desc={s.coachModelDesc} below={<ModelPicker role="coach" />} />
          <Row label={s.persona} desc={s.personaDesc}>
            <Seg k="coachPersona" labels={t.prompt.coaches.map((c) => c.n)} values={[0, 1, 2]} />
          </Row>
          <Row label={s.depth} desc={s.depthDesc}>
            <Seg k="level" labels={s.levels} values={['novice', 'pro']} />
          </Row>
          <Row label={s.hard} desc={s.hardDesc}>
            <Tog k="hard" />
          </Row>
        </Group>
        <Group title={s.look}>
          <Row label={a.felt} desc={s.feltDesc}>
            <FeltSwatches size={24} />
          </Row>
          <Row label={a.back} desc={s.backDesc}>
            <BackSwatches />
          </Row>
          <Row label={a.fx} desc={s.fxDesc}>
            <FxSegment />
          </Row>
        </Group>
        <Group title={s.pricing}>
          <Row label={s.currency} desc={s.currencyDesc}>
            <Currency />
          </Row>
          <FxRate />
        </Group>
        <Data />
      </div>
    </div>
  )
}
