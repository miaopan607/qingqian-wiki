import { Keyboard } from 'lucide-react'

import { KeycapCard } from '../components/keycap/KeycapCard'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, Masonry, PageHeader, Skeleton } from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { usePagination } from '../hooks/usePagination'
import { apiGet } from '../lib/apiClient'
import { getErrorMessage } from '../lib/errorHandler'
import type { KeycapListResponse } from '../types/api'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [24, 50, 100]
const SKELETON_HEIGHTS = ['h-[240px]', 'h-[320px]', 'h-[280px]', 'h-[360px]']

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
      <PageHeader title="键帽" />

      {list.loading ? (
        <Masonry className="mt-8 [--masonry-columns:1] sm:[--masonry-columns:2] lg:[--masonry-columns:3] xl:[--masonry-columns:4] gap-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className={SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length]} />
          ))}
        </Masonry>
      ) : list.error ? (
        <ErrorState message={getErrorMessage(list.error, '键帽加载失败')} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <EmptyState icon={Keyboard} title="暂无键帽记录" />
      ) : (
        <>
          <Masonry className="mt-8 [--masonry-columns:1] sm:[--masonry-columns:2] lg:[--masonry-columns:3] xl:[--masonry-columns:4] gap-4">
            {items.map((keycap, index) => (
              <KeycapCard key={keycap.id} keycap={keycap} priority={index < 4} />
            ))}
          </Masonry>
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
