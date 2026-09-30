import { ArrowLeft, Keyboard } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ImageGrid } from '../components/gallery/ImageGrid'
import { Lightbox, type LightboxImage } from '../components/Lightbox'
import { Badge, EmptyState, LinkButton, Masonry, Panel, Skeleton } from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/apiClient'
import { getErrorMessage } from '../lib/errorHandler'
import { formatDate } from '../lib/format'
import type { KeycapDetailResponse } from '../types/api'

const IMAGE_SKELETON_HEIGHTS = ['h-[180px]', 'h-[260px]', 'h-[220px]', 'h-[300px]']

export default function KeycapDetail() {
  const { keycapId = '' } = useParams()
  const detail = useAsyncData<KeycapDetailResponse>(
    () => apiRequest<KeycapDetailResponse>(`/api/keycaps/${keycapId}`, { dedup: false }),
    [keycapId]
  )
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (detail.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-4 h-20 w-full" />
        <Masonry className="mt-6 [--masonry-columns:2] md:[--masonry-columns:3] lg:[--masonry-columns:4] [--masonry-gap:0.75rem]">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton
              key={index}
              className={IMAGE_SKELETON_HEIGHTS[index % IMAGE_SKELETON_HEIGHTS.length]}
            />
          ))}
        </Masonry>
      </div>
    )
  }

  const keycap = detail.data?.keycap
  if (detail.error || !keycap) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Panel>
          <EmptyState
            icon={Keyboard}
            title="键帽不存在或已删除"
            description={detail.error ? getErrorMessage(detail.error) : undefined}
            action={<LinkButton to="/keycaps">返回键帽</LinkButton>}
          />
        </Panel>
      </div>
    )
  }

  const lightboxImages: LightboxImage[] = keycap.images.map((image) => ({
    id: image.id,
    url: image.url,
    displayUrl: image.displayUrl,
    width: image.width,
    height: image.height,
    blurhash: image.blurhash,
  }))

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-8">
      <Link
        to="/keycaps"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        返回键帽
      </Link>

      <header className="mt-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="accent">第 {keycap.seq} 团</Badge>
          <h1 className="text-2xl text-ink md:text-3xl">{keycap.name}</h1>
        </div>
        {keycap.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
            {keycap.description}
          </p>
        )}
        <p className="border-b border-border pb-3 text-xs text-ink-muted">
          更新于 {formatDate(keycap.updatedAt)}
        </p>
      </header>

      <div className="mt-6">
        {keycap.images.length === 0 ? (
          <EmptyState icon={Keyboard} title="该键帽还没有图片" />
        ) : (
          <ImageGrid images={keycap.images} onOpen={(index) => setLightboxIndex(index)} />
        )}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
