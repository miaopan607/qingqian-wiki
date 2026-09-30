import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  MoveHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { clampTranslation, computeNextScale, getFitScale } from '../lib/lightbox'
import { cn } from './ui/utils'

export type LightboxImage = {
  id: string
  url: string
  displayUrl?: string
  width: number
  height: number
  blurhash?: string | null
}

type LightboxProps = {
  images: LightboxImage[]
  index: number
  onClose: () => void
}

const ZOOM_RATIO = 0.25
const MIN_SCALE = 0.2
const MAX_SCALE = 8
const SWIPE_THRESHOLD = 40

// 灯箱：支持切换、缩放、拖拽、双指缩放与缩略图导航
export function Lightbox({ images, index, onClose }: LightboxProps) {
  const [activeIndex, setActiveIndex] = useState(index)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [loading, setLoading] = useState(true)

  const stageRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const dragStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(
    null
  )
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null)

  const activeImage = images[activeIndex]
  const fitScale = getFitScale(natural.width, natural.height, viewport.width, viewport.height)
  const displayScale = Math.max(0.0001, fitScale * scale)

  const goTo = useCallback(
    (nextIndex: number) => {
      if (images.length === 0) return
      const normalized = (nextIndex + images.length) % images.length
      setActiveIndex(normalized)
      setScale(1)
      setOffset({ x: 0, y: 0 })
      setNatural({ width: 0, height: 0 })
      setLoading(true)
    },
    [images.length]
  )

  // 打开时锁定页面滚动，关闭后恢复
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        goTo(activeIndex + 1)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        goTo(activeIndex - 1)
        return
      }
      if (event.key === '+' || event.key === '=') {
        setScale((current) => computeNextScale(current, true, ZOOM_RATIO, MIN_SCALE, MAX_SCALE))
        return
      }
      if (event.key === '-') {
        setScale((current) => computeNextScale(current, false, ZOOM_RATIO, MIN_SCALE, MAX_SCALE))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, goTo, onClose])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return

    const update = () => {
      setViewport({ width: element.clientWidth, height: element.clientHeight })
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const clampOffset = useCallback(
    (next: { x: number; y: number }) => ({
      x: clampTranslation(next.x, viewport.width, natural.width * displayScale),
      y: clampTranslation(next.y, viewport.height, natural.height * displayScale),
    }),
    [displayScale, natural.height, natural.width, viewport.height, viewport.width]
  )

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const ratio = Math.min(0.2, Math.abs(event.deltaY) / 800)
    setScale((current) => computeNextScale(current, event.deltaY < 0, ratio, MIN_SCALE, MAX_SCALE))
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointersRef.current.size === 2) {
      const [first, second] = Array.from(pointersRef.current.values())
      pinchRef.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y),
        scale,
      }
      dragStartRef.current = null
      return
    }

    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [first, second] = Array.from(pointersRef.current.values())
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      const next = (pinchRef.current.scale * distance) / Math.max(1, pinchRef.current.distance)
      setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)))
      return
    }

    const start = dragStartRef.current
    if (!start) return

    setOffset(
      clampOffset({
        x: start.offsetX + (event.clientX - start.x),
        y: start.offsetY + (event.clientY - start.y),
      })
    )
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    pointersRef.current.delete(event.pointerId)

    if (pointersRef.current.size < 2) pinchRef.current = null

    if (!start) return
    const movedX = event.clientX - start.x
    const movedY = event.clientY - start.y
    dragStartRef.current = null

    // 位移很小视为点击背景或触摸滑动切图
    if (Math.abs(movedX) < SWIPE_THRESHOLD && Math.abs(movedY) < SWIPE_THRESHOLD) {
      const target = event.target as HTMLElement
      if (target.dataset.lightboxBackdrop === 'true') onClose()
      return
    }

    if (scale <= 1 && Math.abs(movedX) > SWIPE_THRESHOLD && Math.abs(movedX) > Math.abs(movedY)) {
      goTo(activeIndex + (movedX < 0 ? 1 : -1))
      setOffset({ x: 0, y: 0 })
    }
  }

  if (!activeImage) return null

  const toolbarButtonClass =
    'inline-flex size-9 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40'

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-[rgb(9_13_14/0.94)] text-white">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="text-xs text-white/70">
          {activeIndex + 1} / {images.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={toolbarButtonClass}
            aria-label="缩小"
            onClick={() =>
              setScale((current) =>
                computeNextScale(current, false, ZOOM_RATIO, MIN_SCALE, MAX_SCALE)
              )
            }
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            aria-label="放大"
            onClick={() =>
              setScale((current) =>
                computeNextScale(current, true, ZOOM_RATIO, MIN_SCALE, MAX_SCALE)
              )
            }
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            aria-label="适应窗口"
            onClick={() => {
              setScale(1)
              setOffset({ x: 0, y: 0 })
            }}
          >
            <MoveHorizontal className="size-4" />
          </button>
          <button
            type="button"
            className={toolbarButtonClass}
            aria-label="实际大小"
            onClick={() => {
              setScale(Math.min(MAX_SCALE, 1 / Math.max(fitScale, 0.0001)))
              setOffset({ x: 0, y: 0 })
            }}
          >
            <Maximize className="size-4" />
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            className={toolbarButtonClass}
            aria-label="关闭灯箱"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        data-lightbox-backdrop="true"
        className="relative flex-1 touch-none overflow-hidden"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={() => {
          setScale((current) =>
            current > 1.05 ? 1 : Math.min(MAX_SCALE, 1 / Math.max(fitScale, 0.0001))
          )
          setOffset({ x: 0, y: 0 })
        }}
      >
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/85 hover:bg-black/60"
              onClick={() => goTo(activeIndex - 1)}
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white/85 hover:bg-black/60"
              onClick={() => goTo(activeIndex + 1)}
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}

        <div className="flex size-full items-center justify-center">
          <img
            src={activeImage.displayUrl ?? activeImage.url}
            alt={`图片 ${activeIndex + 1}`}
            draggable={false}
            onLoad={(event) => {
              const target = event.currentTarget
              setNatural({ width: target.naturalWidth, height: target.naturalHeight })
              setLoading(false)
            }}
            className={cn(
              'max-w-none select-none transition-opacity duration-200',
              loading && 'opacity-0'
            )}
            style={{
              width: natural.width ? natural.width * displayScale : undefined,
              height: natural.height ? natural.height * displayScale : undefined,
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
            }}
          />
        </div>

        {loading && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs text-white/70">
            加载中…
          </span>
        )}
      </div>

      {images.length > 1 && (
        <div className="qq-scrollbar-hidden flex items-center gap-2 overflow-x-auto px-4 py-3">
          {images.map((image, itemIndex) => (
            <button
              key={image.id}
              type="button"
              aria-label={`查看第 ${itemIndex + 1} 张`}
              onClick={() => goTo(itemIndex)}
              className={cn(
                'size-12 shrink-0 overflow-hidden rounded-lg border transition-colors',
                itemIndex === activeIndex ? 'border-white' : 'border-white/25 hover:border-white/60'
              )}
            >
              <img src={image.displayUrl ?? image.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}
