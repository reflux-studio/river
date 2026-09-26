import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getRegistry, saveProvider, useT } from '@/lib/river'
import type { ProviderPublic } from '../../../shared/types'

type Registry = Awaited<ReturnType<typeof getRegistry>>

export function useRegistry() {
  const [reg, setReg] = useState<Registry>([])
  useEffect(() => void getRegistry().then(setReg, () => {}), [])
  return reg
}

function Form({ provider, onDone }: { provider?: ProviderPublic; onDone: () => void }) {
  const reg = useRegistry()
  const t = useT()
  const P = t.desktop.provider
  const [kind, setKind] = useState(provider?.kind ?? '')
  const [name, setName] = useState(provider?.name ?? '')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const compatible = kind === 'openai-compatible'
  // 内置提供方首次保存必须有 key；编辑时留空表示沿用已保存的 key
  const needKey = !compatible && !provider?.keyTail
  const valid = !!kind && !!name.trim() && (!compatible || !!baseUrl.trim()) && (!needKey || !!apiKey.trim())

  const pickKind = (k: string) => {
    const prevName = reg.find((r) => r.kind === kind)?.name
    if (!name.trim() || name === prevName) setName(reg.find((r) => r.kind === k)?.name ?? k)
    setKind(k)
  }

  const submit = async () => {
    setSaving(true)
    setError('')
    try {
      await saveProvider({
        id: provider?.id,
        name: name.trim(),
        kind,
        ...(compatible && { baseUrl: baseUrl.trim() }),
        ...(apiKey.trim() && { apiKey: apiKey.trim() })
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // 注册表本身无序（200 多项），按名称排序便于查找；openai-compatible 置顶
  const kinds = [...reg].sort(
    (a, b) => Number(b.kind === 'openai-compatible') - Number(a.kind === 'openai-compatible') || a.name.localeCompare(b.name)
  )

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && !saving) void submit()
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg font-semibold">{provider ? P.editTitle : P.addTitle}</DialogTitle>
        <DialogDescription>{P.desc}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label>{P.kind}{provider && <span className="font-normal text-muted-foreground">{P.kindLocked}</span>}</Label>
        <Select value={kind} onValueChange={pickKind} disabled={!!provider}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={P.kindPh} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {kinds.map((r) => (
              <SelectItem key={r.kind} value={r.kind}>
                {r.name}
                <span className="text-muted-foreground">{r.kind}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pv-name">{P.name}</Label>
        <Input id="pv-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {compatible && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pv-url">Base URL</Label>
          <Input id="pv-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pv-key">API key{compatible && <span className="font-normal text-muted-foreground">{P.optional}</span>}</Label>
        <Input
          id="pv-key"
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={provider?.keyTail ? P.keyKeep(provider.keyTail) : ''}
        />
      </div>
      {error && <p className="text-[13px] text-lose">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" className="rounded-full" onClick={onDone}>{t.desktop.btn.cancel}</Button>
        <Button type="submit" className="rounded-full" disabled={!valid || saving}>{saving ? P.saving : P.save}</Button>
      </DialogFooter>
    </form>
  )
}

export function ProviderDialog({
  open, provider, onOpenChange
}: {
  open: boolean
  provider?: ProviderPublic
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-[440px]">
        <Form provider={provider} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}
