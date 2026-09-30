import { ArrowLeft, ImageIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ImageGrid } from '../components/gallery/ImageGrid'
import { InteractionButtons } from '../components/gallery/InteractionButtons'
import { Lightbox, type LightboxImage } from '../components/Lightbox'
import { Badge, EmptyState, LinkButton, Masonry, Panel, Skeleton } from '../components/ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/apiClient'
import { getErrorMessage } from '../lib/errorHandler'
import { formatDateTime } from '../lib/format'
import type { GalleryDetailResponse } from '../types/api'
import type { GalleryDetail as GalleryDetailEntity } from '../types/entities'

const IMAGE_SKELETON_HEIGHTS = ['h-[180px]', 'h-[260px]', 'h-[220px]', 'h-[300px]']

export default function GalleryDetail() {
  const { galleryId = '' } = useParams()
  const detail = useAsyncData<GalleryDetailResponse>(
    () => apiRequest<GalleryDetailResponse>(`/api/galleries/${galleryId}`, { dedup: false }),
    [galleryId]
  )

  const [gallery, setGallery] = useState<GalleryDetailEntity | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    if (detail.data) setGallery(detail.data.gallery)
  }, [detail.data])

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

  if (detail.error || !gallery) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Panel>
          <EmptyState
            icon={ImageIcon}
            title="图集不存在或已下架"
            description={detail.error ? getErrorMessage(detail.error) : undefined}
            action={<LinkButton to="/gallery">返回美图</LinkButton>}
          />
        </Panel>
      </div>
    )
  }

  const lightboxImages: LightboxImage[] = gallery.images.map((image) => ({
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
        to="/gallery"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        返回美图
      </Link>

      <header className="mt-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl text-ink md:text-3xl">{gallery.title}</h1>
          {gallery.status === 'draft' && <Badge tone="muted">草稿（仅管理员可见）</Badge>}
          <Badge tone="accent">{gallery.images.length} 张</Badge>
        </div>

        {gallery.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
            {gallery.description}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span>{gallery.author.displayName}</span>
            <span>{formatDateTime(gallery.publishedAt ?? gallery.createdAt)}</span>
          </div>
          <InteractionButtons
            galleryId={gallery.id}
            liked={gallery.liked}
            likesCount={gallery.likesCount}
            favorited={gallery.favorited}
            favoritesCount={gallery.favoritesCount}
            onChange={(next) =>
              setGallery((current) => (current ? { ...current, ...next } : current))
            }
          />
        </div>
      </header>

      <div className="mt-6">
        {gallery.images.length === 0 ? (
          <EmptyState icon={ImageIcon} title="该图集还没有图片" />
        ) : (
          <ImageGrid images={gallery.images} onOpen={(index) => setLightboxIndex(index)} />
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
