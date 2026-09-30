import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

type UsePaginationOptions = {
  total: number
  defaultPageSize: number
  pageSizeOptions: number[]
}

// 分页状态与 URL query 双向同步，方便分享与前进后退
export function usePagination({ total, defaultPageSize, pageSizeOptions }: UsePaginationOptions) {
  const [searchParams, setSearchParams] = useSearchParams()

  const pageSizeParam = Number(searchParams.get('pageSize'))
  const pageSize = pageSizeOptions.includes(pageSizeParam) ? pageSizeParam : defaultPageSize

  const pageParam = Number(searchParams.get('page'))
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? Math.min(pageParam, totalPages) : 1

  const updateParams = useCallback(
    (next: { page?: number; pageSize?: number }) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          const nextPage = next.page ?? page
          const nextPageSize = next.pageSize ?? pageSize

          if (nextPage <= 1) params.delete('page')
          else params.set('page', String(nextPage))

          if (nextPageSize === defaultPageSize) params.delete('pageSize')
          else params.set('pageSize', String(nextPageSize))

          return params
        },
        { replace: true }
      )
    },
    [defaultPageSize, page, pageSize, setSearchParams]
  )

  const setPage = useCallback(
    (nextPage: number) => updateParams({ page: nextPage }),
    [updateParams]
  )
  const setPageSize = useCallback(
    (nextPageSize: number) => updateParams({ page: 1, pageSize: nextPageSize }),
    [updateParams]
  )

  return useMemo(
    () => ({ page, pageSize, totalPages, setPage, setPageSize }),
    [page, pageSize, totalPages, setPage, setPageSize]
  )
}
