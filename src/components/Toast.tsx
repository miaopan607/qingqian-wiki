import * as ToastPrimitive from '@radix-ui/react-toast'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { cn } from './ui/utils'

type ToastTone = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  title: string
  description?: string
  tone: ToastTone
}

type ToastContextValue = {
  show: (toast: { title: string; description?: string; tone?: ToastTone }) => void
}

const ToastContext = createContext<ToastContextValue>({ show: () => {} })

const TONE_CLASSES: Record<ToastTone, string> = {
  success: 'border-accent/40',
  error: 'border-danger/40',
  info: 'border-border',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const show = useCallback((toast: { title: string; description?: string; tone?: ToastTone }) => {
    setToasts((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        title: toast.title,
        description: toast.description,
        tone: toast.tone ?? 'info',
      },
    ])
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right" duration={3200}>
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            defaultOpen
            onOpenChange={(open) => {
              if (!open) setToasts((current) => current.filter((item) => item.id !== toast.id))
            }}
            className={cn(
              'flex items-start gap-3 rounded-xl border bg-surface p-4 shadow-card',
              TONE_CLASSES[toast.tone]
            )}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 text-accent" aria-hidden="true" />
            ) : toast.tone === 'error' ? (
              <XCircle className="mt-0.5 size-4 text-danger" aria-hidden="true" />
            ) : null}
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-medium text-ink">
                {toast.title}
              </ToastPrimitive.Title>
              {toast.description && (
                <ToastPrimitive.Description className="mt-1 text-xs text-ink-muted">
                  {toast.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close aria-label="关闭提示" className="text-ink-muted hover:text-ink">
              <X className="size-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed right-4 top-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
