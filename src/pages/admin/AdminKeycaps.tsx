import { Keyboard, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Pagination } from '../../components/Pagination'
import {
  AlertDialog,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  PageHeader,
  Panel,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import { useAsyncData } from '../../hooks/useAsyncData'
import { usePagination } from '../../hooks/usePagination'
import { apiDelete, apiGet } from '../../lib/apiClient'
import { getErrorMessage } from '../../lib/errorHandler'
import { formatDateTime } from '../../lib/format'
import { invalidateCacheByPrefix } from '../../lib/requestDedup'
import type { KeycapListResponse } from '../../types/api'
import type { KeycapItem } from '../../types/entities'

const PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [10, 20, 50]

export default function AdminKeycaps() {
  const navigate = useNavigate()
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [deleting, setDeleting] = useState<KeycapItem | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const pagination = usePagination({
    total: 0,
    defaultPageSize: PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  })

  const list = useAsyncData<KeycapListResponse>(
    (signal) =>
      apiGet<KeycapListResponse>(
        '/api/admin/keycaps',
        { page: pagination.page, pageSize: pagination.pageSize, q: query || undefined },
        signal
      ),
    [pagination.page, pagination.pageSize, query]
  )

  useEffect(() => {
    pagination.setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize))

  const handleDelete = async () => {
    if (!deleting) return

    setDeletePending(true)
    try {
      await apiDelete(`/api/admin/keycaps/${deleting.id}`)
      invalidateCacheByPrefix('/api/keycaps')
      invalidateCacheByPrefix('/api/admin/keycaps')
      toast.show({ title: '键帽已删除', tone: 'success' })
      setDeleting(null)
      list.reload()
    } catch (error) {
      toast.show({ title: '删除失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="键帽管理"
        subtitle="按开团序号维护键帽档案"
        actions={
          <Button
            leftIcon={<Plus className="size-4" />}
            onClick={() => navigate('/admin/keycaps/new')}
          >
            新建键帽
          </Button>
        }
      />

      <Panel className="p-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(keyword.trim())
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-xs text-ink-muted">搜索名称或描述</span>
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="输入关键词"
            />
          </label>
          <Button type="submit" variant="outline" leftIcon={<Search className="size-4" />}>
            搜索
          </Button>
        </form>
      </Panel>

      <Panel className="p-0">
        {list.loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState message={getErrorMessage(list.error, '键帽加载失败')} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Keyboard}
            title="没有匹配的键帽"
            description="换个关键词，或新建一条键帽记录。"
            action={<Button onClick={() => navigate('/admin/keycaps/new')}>新建键帽</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>封面</TableHead>
                <TableHead>序号</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>图片</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((keycap) => (
                <TableRow key={keycap.id}>
                  <TableCell>
                    {keycap.cover ? (
                      <img
                        src={keycap.cover.thumbUrl}
                        alt=""
                        className="size-12 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="block size-12 rounded-lg bg-surface-alt" />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge tone="accent">第 {keycap.seq} 团</Badge>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={`/admin/keycaps/${keycap.id}/edit`}
                      className="line-clamp-1 font-medium text-ink hover:text-accent"
                    >
                      {keycap.name}
                    </Link>
                    {keycap.description && (
                      <p className="line-clamp-1 text-xs text-ink-muted">{keycap.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{keycap.imagesCount}</TableCell>
                  <TableCell className="text-xs text-ink-muted">
                    {formatDateTime(keycap.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        aria-label="编辑键帽"
                        onClick={() => navigate(`/admin/keycaps/${keycap.id}/edit`)}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton aria-label="删除键帽" onClick={() => setDeleting(keycap)}>
                        <Trash2 className="size-4 text-danger" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={pagination.page}
        totalPages={totalPages}
        onPageChange={pagination.setPage}
        pageSize={pagination.pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={pagination.setPageSize}
      />

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`删除键帽「${deleting?.name ?? ''}」？`}
        description="该记录与其图片会被删除，未被其它内容引用的图片文件会一并清理，操作不可撤销。"
        confirmText="删除"
        tone="danger"
        loading={deletePending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
