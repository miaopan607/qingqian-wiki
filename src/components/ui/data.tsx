import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react'

import { cn } from './utils'

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-160 border-collapse text-sm">{children}</table>
    </div>
  )
}

export function TableHeader({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border text-left text-xs text-ink-muted">{children}</thead>
  )
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>
}

export function TableRow({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn('transition-colors hover:bg-surface-alt/60', className)}>{children}</tr>
}

export function TableHead({
  children,
  className,
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('whitespace-nowrap px-3 py-2.5 font-medium', className)} {...rest}>
      {children}
    </th>
  )
}

export function TableCell({
  children,
  className,
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-3 py-3 align-middle text-ink', className)} {...rest}>
      {children}
    </td>
  )
}
