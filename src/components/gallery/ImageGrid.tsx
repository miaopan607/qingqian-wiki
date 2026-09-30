import { SmartImage } from '../SmartImage'
import { Masonry, cn } from '../ui'
import type { GalleryImageItem } from '../../types/entities'

type ImageGridProps = {
  images: GalleryImageItem[]
  onOpen: (index: number) => void
  className?: string
}

export function ImageGrid({ images, onOpen, className }: ImageGridProps) {
  if (images.length === 0) return null

  return (
    <Masonry
      className={cn(
        '[--masonry-columns:2] md:[--masonry-columns:3] lg:[--masonry-columns:4] [--masonry-gap:0.75rem]',
        className
      )}
    >
      {images.map((image, index) => (
        <button
          key={image.id}
          type="button"
          onClick={() => onOpen(index)}
          className="block w-full overflow-hidden rounded-xl border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label={`查看第 ${index + 1} 张图片`}
        >
          <SmartImage
            src={image.thumbUrl}
            blurhash={image.blurhash}
            width={image.width}
            height={image.height}
            alt={`图片 ${index + 1}`}
            wrapperClassName="w-full"
          />
        </button>
      ))}
    </Masonry>
  )
}
