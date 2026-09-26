import type { ReactNode } from 'react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { useT } from '@/lib/river'

export function Confirm({
  title, description, action, onConfirm, children
}: {
  title: string
  description: ReactNode
  action: string
  onConfirm: () => void
  children: ReactNode
}) {
  const t = useT()
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-semibold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="leading-relaxed">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full">{t.desktop.btn.cancel}</AlertDialogCancel>
          <AlertDialogAction className="rounded-full bg-destructive text-white hover:bg-destructive/90" onClick={onConfirm}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
