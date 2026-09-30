import { decode } from 'blurhash'
import { useEffect, useState } from 'react'

import { cn } from './ui/utils'

type SmartImageProps = {
  src: string | null | undefined
  alt: string
  blurhash?: string | null
  width?: number
  height?: number
  className?: string
  wrapperClassName?: string
  priority?: boolean
}

const BLUR_DECODE_WIDTH = 32
const BLUR_DECODE_HEIGHT = 32

function decodeBlurhash(hash: string): string | null {
  try {
    const pixels = decode(hash, BLUR_DECODE_WIDTH, BLUR_DECODE_HEIGHT)
    const canvas = document.createElement('canvas')
    canvas.width = BLUR_DECODE_WIDTH
    canvas.height = BLUR_DECODE_HEIGHT

    const context = canvas.getContext('2d')
    if (!context) return null

    const imageData = context.createImageData(BLUR_DECODE_WIDTH, BLUR_DECODE_HEIGHT)
    imageData.data.set(pixels)
    context.putImageData(imageData, 0, 0)

    return canvas.toDataURL()
  } catch {
    return null
  }
}

// 图片加载前用 blurhash 铺底，避免大面积空白与布局跳动
export function SmartImage({
  src,
  alt,
  blurhash,
  width,
  height,
  className,
  wrapperClassName,
  priority,
}: SmartImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [placeholder, setPlaceholder] = useState<string | null>(null)

  useEffect(() => {
    setLoaded(false)
    setFailed(false)
    setPlaceholder(blurhash ? decodeBlurhash(blurhash) : null)
  }, [blurhash, src])

  const aspectRatio =
    width !== undefined &&
    Number.isFinite(width) &&
    width > 0 &&
    height !== undefined &&
    Number.isFinite(height) &&
    height > 0
      ? `${width} / ${height}`
      : '4 / 3'
  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface-alt text-xs text-ink-muted',
          wrapperClassName
        )}
        style={{ aspectRatio }}
      >
        暂无图片
      </div>
    )
  }

  return (
    <div
      className={cn('relative overflow-hidden bg-surface-alt', wrapperClassName)}
      style={{ aspectRatio }}
    >
      {placeholder && !loaded && (
        <img
          src={placeholder}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full scale-110 blur-xl"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          'absolute inset-0 size-full object-contain transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
          failed && 'opacity-0',
          className
        )}
      />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-alt text-xs text-ink-muted">
          图片加载失败
        </div>
      )}
    </div>
  )
}
