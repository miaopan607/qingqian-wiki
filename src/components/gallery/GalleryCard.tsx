import { Heart, Images } from 'lucide-react'
import { Link } from 'react-router-dom'

import { SmartImage } from '../SmartImage'
import { Badge, Panel, cn } from '../ui'
import { formatDate } from '../../lib/format'
import type { GalleryItem } from '../../types/entities'

type GalleryCardProps = {
  gallery: GalleryItem
  priority?: boolean
  className?: string
}

export function GalleryCard({ gallery, priority, className }: GalleryCardProps) {
  return (
    <Panel
      className={cn('overflow-hidden p-0 transition-shadow hover:shadow-lg', className)}
      padded={false}
    >
      <Link to={`/gallery/${gallery.id}`} className="block">
        <SmartImage
          src={gallery.cover?.thumbUrl}
          blurhash={gallery.cover?.blurhash}
          width={gallery.cover?.width}
          height={gallery.cover?.height}
          alt={gallery.title}
          priority={priority}
          wrapperClassName="w-full"
        />
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 text-base text-ink">{gallery.title}</h3>
            {gallery.status === 'draft' && <Badge tone="muted">草稿</Badge>}
          </div>
          {gallery.description && (
            <p className="line-clamp-2 text-sm text-ink-muted">{gallery.description}</p>
          )}
          <div className="mt-1 flex items-center gap-3 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <Images className="size-3.5" aria-hidden="true" />
              {gallery.imagesCount} 张
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart
                className={cn('size-3.5', gallery.liked && 'fill-vermilion text-vermilion')}
                aria-hidden="true"
              />
              {gallery.likesCount}
            </span>
            <span className="ml-auto">{formatDate(gallery.publishedAt ?? gallery.createdAt)}</span>
          </div>
        </div>
      </Link>
    </Panel>
  )
}
