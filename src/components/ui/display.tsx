import { AlertCircle, Loader2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from './actions'
import { cn } from './utils'

type PanelProps = {
  className?: string
  children: ReactNode
  padded?: boolean
}

export function Panel({ className, children, padded = true }: PanelProps) {
  return (
    <section
      className={cn(
        'rounded-card border border-border bg-surface shadow-card',
        padded && 'p-5',
        className
      )}
    >
      {children}
    </section>
  )
}

type BadgeProps = {
  children: ReactNode
  tone?: 'default' | 'accent' | 'muted' | 'danger' | 'vermilion'
  className?: string
}

const BADGE_TONES: Record<NonNullable<BadgeProps['tone']>, string> = {
  default: 'bg-surface-alt text-ink',
  accent: 'bg-accent-soft text-accent',
  muted: 'bg-surface-alt text-ink-muted',
  danger: 'bg-danger/12 text-danger',
  vermilion: 'bg-vermilion/12 text-vermilion',
}

export function Badge({ children, tone = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-muted" role="status">
      <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden="true" />
      {label && <span className="text-xs">{label}</span>}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-surface-alt', className)} />
}

type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
    >
      {Icon && <Icon className="size-10 text-border" aria-hidden="true" />}
      <p className="text-[0.9375rem] text-ink">{title}</p>
      {description && <p className="max-w-md text-sm text-ink-muted">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center', className)}
    >
      <AlertCircle className="size-10 text-danger" aria-hidden="true" />
      <p className="text-sm text-ink">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  )
}

type PageHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl text-ink md:text-[1.75rem]">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

type AvatarProps = {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// 无头像时用昵称首字生成占位
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const sizeClass =
    size === 'sm' ? 'size-8 text-xs' : size === 'lg' ? 'size-20 text-xl' : 'size-10 text-sm'

  if (src) {
    return (
      <img src={src} alt={name} className={cn('rounded-full object-cover', sizeClass, className)} />
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-accent-soft font-medium text-accent',
        sizeClass,
        className
      )}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  )
}
