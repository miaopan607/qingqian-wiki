import { Slot } from '@radix-ui/react-slot'
import { Link, type LinkProps } from 'react-router-dom'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from './utils'

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover',
  outline: 'border border-border bg-surface text-ink hover:border-accent hover:text-accent',
  ghost: 'text-ink-muted hover:bg-surface-alt hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90',
  soft: 'bg-accent-soft text-accent hover:bg-surface-alt',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[0.8125rem]',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-11 gap-2 px-6 text-[0.9375rem]',
}

export function buttonVariants(options?: {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  className?: string
}) {
  return cn(
    'inline-flex select-none items-center justify-center rounded-full font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
    'disabled:cursor-not-allowed disabled:opacity-55',
    VARIANT_CLASSES[options?.variant ?? 'primary'],
    SIZE_CLASSES[options?.size ?? 'md'],
    options?.block && 'w-full',
    options?.className
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  loading?: boolean
  leftIcon?: ReactNode
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, block, loading, leftIcon, asChild, className, children, disabled, ...rest },
  ref
) {
  const Component = asChild ? Slot : 'button'

  return (
    <Component
      ref={ref}
      className={buttonVariants({ variant, size, block, className })}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : leftIcon}
      {children}
    </Component>
  )
})

type LinkButtonProps = LinkProps & {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  leftIcon?: ReactNode
}

export function LinkButton({
  variant,
  size,
  block,
  leftIcon,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonVariants({ variant, size, block, className })} {...rest}>
      {leftIcon}
      {children}
    </Link>
  )
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  'aria-label': string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', size = 'md', className, children, ...rest },
  ref
) {
  const sizeClass = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-11' : 'size-10'

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-full transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANT_CLASSES[variant],
        sizeClass,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
})
