import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button, IconButton } from './actions'
import { cn } from './utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

type DialogContentProps = {
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  className?: string
}

export function DialogContent({
  title,
  description,
  children,
  footer,
  className,
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[rgb(15_21_22/0.55)] backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
          'overflow-y-auto rounded-card border border-border bg-surface p-6 shadow-card',
          className
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className="text-lg text-ink">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-ink-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <IconButton aria-label="关闭" size="sm">
              <X className="size-4" />
            </IconButton>
          </DialogPrimitive.Close>
        </div>

        {children && <div className="mt-4 flex flex-col gap-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

type AlertDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: 'primary' | 'danger'
  loading?: boolean
  onConfirm: () => void
}

// 危险操作二次确认：由 Dialog 组合而成，保证关闭与焦点行为一致
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  cancelText = '取消',
  tone = 'primary',
  loading,
  onConfirm,
}: AlertDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
              {cancelText}
            </Button>
            <Button
              variant={tone === 'danger' ? 'danger' : 'primary'}
              loading={loading}
              onClick={onConfirm}
            >
              {confirmText}
            </Button>
          </>
        }
      />
    </Dialog>
  )
}

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

export function DropdownMenuContent({
  children,
  className,
  align = 'end',
}: {
  children: ReactNode
  className?: string
  align?: 'start' | 'center' | 'end'
}) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        align={align}
        sideOffset={8}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-card',
          className
        )}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  children,
  onSelect,
  danger,
  className,
}: {
  children: ReactNode
  onSelect?: () => void
  danger?: boolean
  className?: string
}) {
  return (
    <DropdownMenuPrimitive.Item
      onSelect={onSelect}
      className={cn(
        'cursor-pointer select-none rounded-lg px-3 py-2 text-sm outline-none transition-colors',
        danger
          ? 'text-danger data-[highlighted]:bg-danger/10'
          : 'text-ink data-[highlighted]:bg-surface-alt',
        className
      )}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  )
}

export function DropdownMenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="my-1 h-px bg-border" />
}

export const Tabs = TabsPrimitive.Root

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1',
        className
      )}
    >
      {children}
    </TabsPrimitive.List>
  )
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      value={value}
      className={cn(
        'rounded-full px-4 py-1.5 text-sm text-ink-muted transition-colors',
        'data-[state=active]:bg-accent data-[state=active]:text-accent-contrast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'
      )}
    >
      {children}
    </TabsPrimitive.Trigger>
  )
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string
  children: ReactNode
  className?: string
}) {
  return (
    <TabsPrimitive.Content
      value={value}
      className={cn('mt-6 focus-visible:outline-none', className)}
    >
      {children}
    </TabsPrimitive.Content>
  )
}
