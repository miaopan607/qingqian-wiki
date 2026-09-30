import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button, IconButton, Select } from './ui'

type PaginationProps = {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  pageSize?: number
  pageSizeOptions?: number[]
  onPageSizeChange?: (pageSize: number) => void
}

// 页码窗口：始终显示首末页与当前页附近，中间用省略号
function buildPageItems(page: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(totalPages - 1, page + 1)

  if (start > 2) items.push('ellipsis')
  for (let current = start; current <= end; current += 1) items.push(current)
  if (end < totalPages - 1) items.push('ellipsis')
  items.push(totalPages)

  return items
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) {
  if (totalPages <= 1 && !pageSizeOptions) return null

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2 py-6" aria-label="分页">
      <IconButton
        aria-label="上一页"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </IconButton>

      {buildPageItems(page, totalPages).map((item, index) =>
        item === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-sm text-ink-muted">
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? 'primary' : 'outline'}
            size="sm"
            className="min-w-8 px-2"
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        )
      )}

      <IconButton
        aria-label="下一页"
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="size-4" />
      </IconButton>

      {pageSizeOptions && onPageSizeChange && pageSize && (
        <Select
          className="ml-2 h-8 w-auto text-xs"
          aria-label="每页数量"
          value={String(pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {pageSizeOptions.map((option) => (
            <option key={option} value={option}>
              每页 {option}
            </option>
          ))}
        </Select>
      )}
    </nav>
  )
}
