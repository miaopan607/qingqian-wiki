import { Link } from 'react-router-dom'

import { Badge, ErrorState, LinkButton, PageHeader, Panel, Skeleton } from '../../components/ui'
import { useAsyncData } from '../../hooks/useAsyncData'
import { apiGet } from '../../lib/apiClient'
import { getErrorMessage } from '../../lib/errorHandler'
import { formatRelative } from '../../lib/format'
import type { AdminStatsResponse } from '../../types/api'

type StatCard = { label: string; value: number; hint?: string }

export default function AdminDashboard() {
  const stats = useAsyncData<AdminStatsResponse>((signal) =>
    apiGet<AdminStatsResponse>('/api/admin/stats', undefined, signal)
  )

  const cards: StatCard[] = stats.data
    ? [
        {
          label: '图集',
          value: stats.data.galleries,
          hint: `已发布 ${stats.data.publishedGalleries}`,
        },
        { label: '键帽', value: stats.data.keycaps },
        { label: '图片', value: stats.data.images, hint: `未引用 ${stats.data.orphanAssets}` },
        { label: '用户', value: stats.data.users, hint: `封禁 ${stats.data.bannedUsers}` },
      ]
    : []

  if (stats.loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-40" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      </div>
    )
  }

  if (stats.error || !stats.data) {
    return (
      <ErrorState
        message={getErrorMessage(stats.error, '统计数据加载失败')}
        onRetry={stats.reload}
      />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="仪表盘"
        subtitle="内容与用户的整体情况"
        actions={
          <>
            <LinkButton to="/admin/galleries/new" size="sm">
              新建图集
            </LinkButton>
            <LinkButton to="/admin/keycaps/new" size="sm" variant="outline">
              新建键帽
            </LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Panel key={card.label} className="flex flex-col gap-1 p-4">
            <span className="text-xs text-ink-muted">{card.label}</span>
            <span className="font-serif text-3xl text-ink">{card.value}</span>
            {card.hint && <span className="text-xs text-ink-muted">{card.hint}</span>}
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base text-ink">最近图集</h2>
            <Link to="/admin/galleries" className="text-xs text-accent hover:underline">
              全部
            </Link>
          </div>
          {stats.data.latestGalleries.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">暂无图集</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {stats.data.latestGalleries.map((gallery) => (
                <li key={gallery.id} className="flex items-center gap-3 py-2.5">
                  {gallery.cover ? (
                    <img
                      src={gallery.cover.thumbUrl}
                      alt=""
                      className="size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="size-10 shrink-0 rounded-lg bg-surface-alt" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/galleries/${gallery.id}/edit`}
                      className="line-clamp-1 text-sm text-ink hover:text-accent"
                    >
                      {gallery.title}
                    </Link>
                    <p className="text-xs text-ink-muted">
                      {gallery.imagesCount} 张 · {formatRelative(gallery.createdAt)}
                    </p>
                  </div>
                  {gallery.status === 'draft' && <Badge tone="muted">草稿</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base text-ink">最近键帽</h2>
            <Link to="/admin/keycaps" className="text-xs text-accent hover:underline">
              全部
            </Link>
          </div>
          {stats.data.latestKeycaps.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">暂无键帽</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {stats.data.latestKeycaps.map((keycap) => (
                <li key={keycap.id} className="flex items-center gap-3 py-2.5">
                  {keycap.cover ? (
                    <img
                      src={keycap.cover.thumbUrl}
                      alt=""
                      className="size-10 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="size-10 shrink-0 rounded-lg bg-surface-alt" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/keycaps/${keycap.id}/edit`}
                      className="line-clamp-1 text-sm text-ink hover:text-accent"
                    >
                      第 {keycap.seq} 团 · {keycap.name}
                    </Link>
                    <p className="text-xs text-ink-muted">{keycap.imagesCount} 张</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
