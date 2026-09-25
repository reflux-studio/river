// 各 React 岛之间共享的页面状态：外观（演示桌与全下展示共用）、币种（演示桌顶栏与用量卡共用）、最新版本（首屏、下载区、结尾共用）
import type { Back, Felt, Fx } from '@river/ui/types'
import { useEffect, useSyncExternalStore } from 'react'

export type Os = 'mac' | 'win' | 'linux'
export type Release = { v: string } & Partial<Record<Os, string>>

interface State {
  felt: Felt
  feltCustom: string
  back: Back
  fx: Fx
  cur: string | null
  os: Os
  rel: Release | null
}

let state: State = { felt: 'green', feltCustom: '#2f6b55', back: 'red', fx: 'full', cur: null, os: 'mac', rel: null }
const subs = new Set<() => void>()
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f))
const get = () => state

export const setSite = (p: Partial<State>) => {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}

export const useSite = () => useSyncExternalStore(subscribe, get, get)

export const REPO = 'https://github.com/reflux-studio/river'
export const LATEST = `${REPO}/releases/latest`

// 安装包文件名规则见 apps/desktop/electron-builder.yml 的 artifactName（mac: River-x.y.z-arm64.dmg，win: -x64-setup.exe，linux: -x86_64.AppImage）
const ASSET: Record<Os, RegExp> = { mac: /-arm64\.dmg$/i, win: /-setup\.exe$/i, linux: /\.AppImage$/i }

let loading = false
function load() {
  if (loading) return
  loading = true
  const ua = navigator.userAgent
  setSite({ os: /Windows/i.test(ua) ? 'win' : /Linux/i.test(ua) && !/Android/i.test(ua) ? 'linux' : 'mac' })
  fetch('https://api.github.com/repos/reflux-studio/river/releases/latest')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { tag_name: string; assets?: { name: string; browser_download_url: string }[] } | null) => {
      if (!j) return
      const rel: Release = { v: j.tag_name }
      for (const os of Object.keys(ASSET) as Os[]) rel[os] = j.assets?.find((a) => ASSET[os].test(a.name))?.browser_download_url
      setSite({ rel })
    })
    // 请求失败时链接保持 releases/latest，版本号不显示
    .catch(() => {})
}

// 需要平台或版本的岛调用；只请求一次
export function useRelease() {
  useEffect(load, [])
  const { rel, os } = useSite()
  return { rel, os, url: (k: Os) => rel?.[k] ?? LATEST }
}

export const CUR: [string, string, number][] = [['cny', '¥', 7.1], ['usd', '$', 1], ['hkd', 'HK$', 7.8], ['eur', '€', 0.92], ['jpy', 'JP¥', 150]]
export const curOf = (cur: string | null, lang: 'zh' | 'en') => CUR.find((c) => c[0] === (cur ?? (lang === 'en' ? 'usd' : 'cny')))!
export const money = (usd: number, c: [string, string, number]) => {
  const v = usd * c[2]
  return c[1] + (v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toFixed(4))
}
