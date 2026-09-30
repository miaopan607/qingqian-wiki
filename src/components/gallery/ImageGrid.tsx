import { SmartImage } from '../SmartImage'
import { cn } from '../ui'
import type { GalleryImageItem } from '../../types/entities'

type ImageGridProps = {
  images: GalleryImageItem[]
  onOpen: (index: number) => void
  className?: string
}

export function ImageGrid({ images, onOpen, className }: ImageGridProps) {
  if (images.length === 0) return null

  return (
    <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4', className)}>
      {images.map((image, index) => (
        <button
          key={image.id}
          type="button"
          onClick={() => onOpen(index)}
          className="group overflow-hidden rounded-xl border border-border bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label={`查看第 ${index + 1} 张图片`}
        >
          <SmartImage
            src={image.thumbUrl}
            blurhash={image.blurhash}
            width={image.width}
            height={image.height}
            alt={`图片 ${index + 1}`}
            wrapperClassName="aspect-square w-full"
            className="transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </button>
      ))}
    </div>
  )
}
