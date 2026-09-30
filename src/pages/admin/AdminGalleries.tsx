import { ImageIcon, Pencil, Plus, Search, Trash2 } from 'lucide-react'
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
  Select,
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
import type { GalleryListResponse } from '../../types/api'
import type { GalleryItem } from '../../types/entities'

const PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [10, 20, 50]

export default function AdminGalleries() {
  const navigate = useNavigate()
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'' | 'draft' | 'published'>('')
  const [deleting, setDeleting] = useState<GalleryItem | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  const pagination = usePagination({
    total: 0,
    defaultPageSize: PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  })

  const list = useAsyncData<GalleryListResponse>(
    (signal) =>
      apiGet<GalleryListResponse>(
        '/api/admin/galleries',
        {
          page: pagination.page,
          pageSize: pagination.pageSize,
          q: query || undefined,
          status: status || undefined,
        },
        signal
      ),
    [pagination.page, pagination.pageSize, query, status]
  )

  useEffect(() => {
    pagination.setPage(1)
    // 关键词/状态变化时回到第一页
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status])

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize))

  const handleDelete = async () => {
    if (!deleting) return

    setDeletePending(true)
    try {
      await apiDelete(`/api/admin/galleries/${deleting.id}`)
      invalidateCacheByPrefix('/api/galleries')
      invalidateCacheByPrefix('/api/admin/galleries')
      toast.show({ title: '图集已删除', tone: 'success' })
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
        title="美图管理"
        actions={
          <Button
            leftIcon={<Plus className="size-4" />}
            onClick={() => navigate('/admin/galleries/new')}
          >
            新建图集
          </Button>
        }
      />

      <Panel className="flex flex-wrap items-end gap-3 p-4">
        <form
          className="flex flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(keyword.trim())
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-xs text-ink-muted">搜索标题</span>
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="输入标题关键词"
            />
          </label>
          <Button type="submit" variant="outline" leftIcon={<Search className="size-4" />}>
            搜索
          </Button>
        </form>

        <label className="flex w-40 flex-col gap-1.5">
          <span className="text-xs text-ink-muted">状态</span>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="">全部</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
          </Select>
        </label>
      </Panel>

      <Panel className="p-0">
        {list.loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState message={getErrorMessage(list.error, '图集加载失败')} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={ImageIcon}
            title="没有匹配的图集"
            action={<Button onClick={() => navigate('/admin/galleries/new')}>新建图集</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>封面</TableHead>
                <TableHead>序号</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>图片</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>点赞/收藏</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((gallery) => (
                <TableRow key={gallery.id}>
                  <TableCell>
                    {gallery.cover ? (
                      <img
                        src={gallery.cover.thumbUrl}
                        alt=""
                        className="size-12 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="block size-12 rounded-lg bg-surface-alt" />
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{gallery.seq}</TableCell>
                  <TableCell>
                    <Link
                      to={`/admin/galleries/${gallery.id}/edit`}
                      className="line-clamp-1 font-medium text-ink hover:text-accent"
                    >
                      {gallery.title}
                    </Link>
                    {gallery.description && (
                      <p className="line-clamp-1 text-xs text-ink-muted">{gallery.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{gallery.imagesCount}</TableCell>
                  <TableCell>
                    {gallery.status === 'published' ? (
                      <Badge tone="accent">已发布</Badge>
                    ) : (
                      <Badge tone="muted">草稿</Badge>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums text-xs text-ink-muted">
                    {gallery.likesCount} / {gallery.favoritesCount}
                  </TableCell>
                  <TableCell className="text-xs text-ink-muted">
                    {formatDateTime(gallery.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        aria-label="编辑图集"
                        onClick={() => navigate(`/admin/galleries/${gallery.id}/edit`)}
                      >
                        <Pencil className="size-4" />
                      </IconButton>
                      <IconButton aria-label="删除图集" onClick={() => setDeleting(gallery)}>
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
        title={`删除图集「${deleting?.title ?? ''}」？`}
        description="图集、点赞与收藏记录会被删除，未被其它内容引用的图片文件也会一并清理，操作不可撤销。"
        confirmText="删除"
        tone="danger"
        loading={deletePending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
