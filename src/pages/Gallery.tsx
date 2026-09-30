import { ImageIcon } from 'lucide-react'

import { GalleryCard } from '../components/gallery/GalleryCard'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { usePagination } from '../hooks/usePagination'
import { apiGet } from '../lib/apiClient'
import { getErrorMessage } from '../lib/errorHandler'
import type { GalleryListResponse } from '../types/api'

const DEFAULT_PAGE_SIZE = 24
const PAGE_SIZE_OPTIONS = [12, 24, 48]

export default function Gallery() {
  const pagination = usePagination({
    total: 0,
    defaultPageSize: DEFAULT_PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  })

  const list = useAsyncData<GalleryListResponse>(
    (signal) =>
      apiGet<GalleryListResponse>(
        '/api/galleries',
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
      <PageHeader title="美图" />

      {list.loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-64" />
          ))}
        </div>
      ) : list.error ? (
        <ErrorState message={getErrorMessage(list.error, '美图加载失败')} onRetry={list.reload} />
      ) : items.length === 0 ? (
        <EmptyState icon={ImageIcon} title="暂无图集" />
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((gallery, index) => (
              <GalleryCard key={gallery.id} gallery={gallery} priority={index < 4} />
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
