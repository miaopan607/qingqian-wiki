import { Keyboard } from 'lucide-react'

import { KeycapCard } from '../components/keycap/KeycapCard'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { usePagination } from '../hooks/usePagination'
import { apiGet } from '../lib/apiClient'
import { getErrorMessage } from '../lib/errorHandler'
import type { KeycapListResponse } from '../types/api'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [24, 50, 100]

export default function Keycaps() {
  const pagination = usePagination({
    total: 0,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  })

  const list = useAsyncData<KeycapListResponse>(
    (signal) =>
      apiGet<KeycapListResponse>(
        '/api/keycaps',
        { page: pagination.page, pageSize: pagination.pageSize },
        signal
      ),
    [pagination.page, pagination.pageSize]
  )

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize))

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8">
      <PageHeader title="键帽" subtitle="按开团序号排列的键帽档案，点开可看多图与描述。" />

      {list.loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      ) : list.error ? (
        <ErrorState message={getErrorMessage(list.error, '键帽加载失败')} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <EmptyState icon={Keyboard} title="暂无键帽记录" description="开团档案整理中。" />
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((keycap, index) => (
              <KeycapCard key={keycap.id} keycap={keycap} priority={index < 4} />
            ))}
          </div>
          <Pagination
            page={pagination.page}
            totalPages={totalPages}
            onPageChange={pagination.setPage}
            pageSize={pagination.pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onPageSizeChange={pagination.setPageSize}
          />
        </>
      )}
    </div>
  )
}
