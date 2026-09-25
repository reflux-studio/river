import { useEffect, useRef } from 'react'

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

// 键为小写字母或 ' '；值为 undefined 表示当前不可用
export function useHotkeys(map: Record<string, (() => void) | undefined>) {
  const ref = useRef(map)
  ref.current = map
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing || typing(e.target)) return
      // 弹窗打开时按键属于弹窗
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return
      const key = e.key.toLowerCase()
      // 焦点在按钮上时空格会原生触发点击，再响应就会执行两次
      if (key === ' ' && e.target instanceof HTMLElement && e.target.closest('button,[role="button"]')) return
      const fn = ref.current[key]
      if (!fn) return
      e.preventDefault()
      fn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
