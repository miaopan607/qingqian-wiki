import {
  ChevronLeft,
  ChevronRight,
  Maximize,
  MoveHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
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

type Point = { x: number; y: number }
type View = Point & { scale: number }
const MAX_SCALE = 8
const CLICK_THRESHOLD = 5
const SWIPE_THRESHOLD = 40

// 原图按像素比例缩放；高频拖动只更新 transform，松手后同步 React 状态。
export function Lightbox({ images, index, onClose }: LightboxProps) {
  const [activeIndex, setActiveIndex] = useState(index)
  const [view, setView] = useState<View>({ x: 0, y: 0, scale: 1 })
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retry, setRetry] = useState(0)
  const stageRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dimensions = useRef({ width: 0, height: 0 })
  const viewport = useRef({ width: 0, height: 0 })
  const viewRef = useRef(view)
  const pointers = useRef(new Map<number, Point>())
  const drag = useRef<{
    point: Point
    view: View
    backdrop: boolean
    moved: boolean
    swipe: boolean
  } | null>(null)
  const pinch = useRef<{ distance: number; center: Point; view: View } | null>(null)
  const historyKey = useRef<string | null>(null)
  const closing = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const activeImage = images[activeIndex]

  const fitScale = useCallback(() => {
    const size = dimensions.current
    const area = viewport.current
    return getFitScale(size.width, size.height, area.width, area.height) || 1
  }, [])

  const applyView = useCallback(
    (next: View, commit = true) => {
      const size = dimensions.current
      const area = viewport.current
      const scale = Math.min(MAX_SCALE, Math.max(Math.min(0.05, fitScale()), next.scale))
      const clamped = {
        scale,
        x: clampTranslation(next.x, area.width, size.width * scale),
        y: clampTranslation(next.y, area.height, size.height * scale),
      }
      viewRef.current = clamped
      if (imageRef.current) {
        imageRef.current.style.transform = `translate3d(${clamped.x}px, ${clamped.y}px, 0) scale(${scale})`
      }
      if (commit) setView(clamped)
    },
    [fitScale]
  )

  const clearGesture = useCallback(() => {
    const stage = stageRef.current
    for (const id of pointers.current.keys()) {
      if (stage?.hasPointerCapture?.(id)) stage.releasePointerCapture(id)
    }
    pointers.current.clear()
    drag.current = null
    pinch.current = null
  }, [])

  const goTo = useCallback(
    (nextIndex: number) => {
      if (!images.length) return
      const normalized = (nextIndex + images.length) % images.length
      if (normalized === activeIndex) return
      clearGesture()
      dimensions.current = { width: 0, height: 0 }
      applyView({ x: 0, y: 0, scale: 1 })
      setStatus('loading')
      setRetry(0)
      setActiveIndex(normalized)
    },
    [activeIndex, images.length, applyView, clearGesture]
  )

  const close = useCallback(() => {
    if (closing.current) return
    closing.current = true
    if (historyKey.current && window.history.state?.lightboxKey === historyKey.current) {
      window.history.back()
    }
    historyKey.current = null
    onCloseRef.current()
  }, [])

  const zoom = useCallback(
    (scale: number, anchor: Point = { x: 0, y: 0 }) => {
      const current = viewRef.current
      const nextScale = Math.min(MAX_SCALE, Math.max(Math.min(0.05, fitScale()), scale))
      const ratio = nextScale / current.scale
      applyView({
        scale: nextScale,
        x: anchor.x - (anchor.x - current.x) * ratio,
        y: anchor.y - (anchor.y - current.y) * ratio,
      })
    },
    [applyView, fitScale]
  )

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    closing.current = false
    const key = crypto.randomUUID()
    // 延迟建立历史记录，避免 StrictMode 的 effect 预演留下额外返回层级。
    const timer = window.setTimeout(() => {
      if (closing.current) return
      historyKey.current = key
      window.history.pushState({ ...window.history.state, lightboxKey: key }, '')
    }, 0)
    const onPopState = () => {
      if (historyKey.current && window.history.state?.lightboxKey !== historyKey.current) {
        historyKey.current = null
        closing.current = true
        onCloseRef.current()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('popstate', onPopState)
      if (historyKey.current && window.history.state?.lightboxKey === historyKey.current)
        window.history.back()
      historyKey.current = null
      document.body.style.overflow = previousOverflow
      if (trigger?.isConnected) trigger.focus()
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const buttons =
          dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')
        if (!buttons?.length) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (
          !dialogRef.current?.contains(document.activeElement) ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last)
        ) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        goTo(activeIndex + 1)
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        goTo(activeIndex - 1)
      } else if (status === 'ready' && ['+', '=', '-'].includes(event.key)) {
        event.preventDefault()
        zoom(
          computeNextScale(
            viewRef.current.scale,
            event.key !== '-',
            0.1,
            Math.min(0.05, fitScale()),
            MAX_SCALE
          )
        )
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, close, fitScale, goTo, status, zoom])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const update = () => {
      const oldFit = fitScale()
      const wasFit = Math.abs(viewRef.current.scale - oldFit) < 0.0001
      viewport.current = { width: stage.clientWidth, height: stage.clientHeight }
      applyView(wasFit ? { x: 0, y: 0, scale: fitScale() } : viewRef.current)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [applyView, fitScale])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      if (status !== 'ready' || !event.deltaY) return
      const rect = stage.getBoundingClientRect()
      zoom(viewRef.current.scale * Math.exp(-event.deltaY * 0.002), {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      })
    }
    // 使用非 passive 原生监听器，确保滚轮不会滚动底层页面。
    stage.addEventListener('wheel', wheel, { passive: false })
    return () => stage.removeEventListener('wheel', wheel)
  }, [status, zoom])

  const startDrag = (point: Point, backdrop: boolean, swipe: boolean) => {
    drag.current = { point, view: { ...viewRef.current }, backdrop, moved: false, swipe }
  }
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button > 0 || (event.target as HTMLElement).closest('button')) return
    const point = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, point)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        view: { ...viewRef.current },
      }
      drag.current = null
    } else if (pointers.current.size === 1) {
      startDrag(point, event.target === event.currentTarget, true)
    }
  }
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    const point = { x: event.clientX, y: event.clientY }
    pointers.current.set(event.pointerId, point)
    if (pointers.current.size === 2 && pinch.current && status === 'ready') {
      const [a, b] = [...pointers.current.values()]
      const start = pinch.current
      const scale = Math.min(
        MAX_SCALE,
        Math.max(
          Math.min(0.05, fitScale()),
          (start.view.scale * Math.hypot(a.x - b.x, a.y - b.y)) / start.distance
        )
      )
      const rect = event.currentTarget.getBoundingClientRect()
      const anchor = {
        x: start.center.x - rect.left - rect.width / 2,
        y: start.center.y - rect.top - rect.height / 2,
      }
      const ratio = scale / start.view.scale
      applyView(
        {
          scale,
          x: anchor.x - (anchor.x - start.view.x) * ratio + (a.x + b.x) / 2 - start.center.x,
          y: anchor.y - (anchor.y - start.view.y) * ratio + (a.y + b.y) / 2 - start.center.y,
        },
        false
      )
    } else if (drag.current) {
      const start = drag.current
      const dx = point.x - start.point.x
      const dy = point.y - start.point.y
      if (Math.hypot(dx, dy) > CLICK_THRESHOLD) start.moved = true
      if (status === 'ready')
        applyView({ scale: start.view.scale, x: start.view.x + dx, y: start.view.y + dy }, false)
    }
  }
  const endPointer = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    if (!pointers.current.has(event.pointerId)) return
    const start = drag.current
    pointers.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    pinch.current = null
    drag.current = null
    applyView(viewRef.current)
    if (pointers.current.size) {
      startDrag([...pointers.current.values()][0], false, false)
      return
    }
    if (cancelled || !start) return
    const dx = event.clientX - start.point.x
    const dy = event.clientY - start.point.y
    const moved = start.moved || Math.hypot(dx, dy) > CLICK_THRESHOLD
    if (!moved && start.backdrop) close()
    else if (
      start.swipe &&
      start.view.scale <= fitScale() + 0.0001 &&
      Math.abs(dx) > SWIPE_THRESHOLD &&
      Math.abs(dx) > Math.abs(dy)
    )
      goTo(activeIndex + (dx < 0 ? 1 : -1))
  }

  if (!activeImage) return null
  const buttonClass =
    'inline-flex size-10 items-center justify-center rounded-full text-viewer-ink/85 transition-colors hover:bg-viewer-ink/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viewer-ink/60 disabled:opacity-40'
  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="图片查看器"
      className="fixed inset-0 z-[200] flex flex-col bg-viewer/95 text-viewer-ink"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <span role="status" aria-live="polite" className="text-xs">
          {activeIndex + 1} / {images.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={buttonClass}
            title="缩小 (-)"
            aria-label="缩小"
            disabled={status !== 'ready'}
            onClick={() => zoom(viewRef.current.scale * 0.9)}
          >
            <ZoomOut className="size-4" />
          </button>
          <span className="min-w-14 text-center font-mono text-xs" aria-label="缩放比例">
            {status === 'ready' ? `${Math.round(view.scale * 100)}%` : '—'}
          </span>
          <button
            type="button"
            className={buttonClass}
            title="放大 (+)"
            aria-label="放大"
            disabled={status !== 'ready'}
            onClick={() => zoom(viewRef.current.scale * 1.1)}
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            title="适应窗口"
            aria-label="适应窗口"
            disabled={status !== 'ready'}
            onClick={() => applyView({ x: 0, y: 0, scale: fitScale() })}
          >
            <MoveHorizontal className="size-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            title="实际大小 (1:1)"
            aria-label="实际大小"
            disabled={status !== 'ready'}
            onClick={() => applyView({ x: 0, y: 0, scale: 1 })}
          >
            <Maximize className="size-4" />
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            className={buttonClass}
            title="关闭灯箱 (Esc)"
            aria-label="关闭灯箱"
            onClick={close}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={stageRef}
        data-lightbox-backdrop="true"
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => endPointer(event)}
        onPointerCancel={(event) => endPointer(event, true)}
        onLostPointerCapture={(event) => endPointer(event, true)}
        onDoubleClick={(event) => {
          if (status !== 'ready' || event.target !== imageRef.current) return
          applyView({
            x: 0,
            y: 0,
            scale: Math.abs(viewRef.current.scale - fitScale()) < 0.0001 ? 1 : fitScale(),
          })
        }}
      >
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              title="上一张 (←)"
              className={cn(
                buttonClass,
                'absolute left-3 top-1/2 z-10 -translate-y-1/2 bg-viewer/60'
              )}
              onClick={() => goTo(activeIndex - 1)}
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="下一张"
              title="下一张 (→)"
              className={cn(
                buttonClass,
                'absolute right-3 top-1/2 z-10 -translate-y-1/2 bg-viewer/60'
              )}
              onClick={() => goTo(activeIndex + 1)}
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
        <div className="pointer-events-none flex size-full items-center justify-center">
          <img
            ref={imageRef}
            key={`${activeImage.id}:${activeImage.url}:${retry}`}
            src={activeImage.url}
            alt={`图片 ${activeIndex + 1}`}
            draggable={false}
            onLoad={(event) => {
              const image = event.currentTarget
              dimensions.current = { width: image.naturalWidth, height: image.naturalHeight }
              setStatus('ready')
              applyView({ x: 0, y: 0, scale: fitScale() })
            }}
            onError={() => setStatus('error')}
            className={cn(
              'max-h-none max-w-none shrink-0 select-none',
              status === 'ready'
                ? 'pointer-events-auto cursor-grab active:cursor-grabbing'
                : 'invisible'
            )}
            style={{
              width: dimensions.current.width || undefined,
              height: dimensions.current.height || undefined,
              transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
            }}
          />
        </div>
        {status === 'loading' && (
          <span
            role="status"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs"
          >
            加载中…
          </span>
        )}
        {status === 'error' && (
          <div
            role="alert"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-sm"
          >
            <p>图片加载失败</p>
            <button
              type="button"
              className="mt-3 rounded border border-viewer-ink/40 px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viewer-ink"
              onClick={() => {
                setStatus('loading')
                setRetry((value) => value + 1)
              }}
            >
              重试
            </button>
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="qq-scrollbar-hidden flex shrink-0 items-center gap-2 overflow-x-auto px-4 py-3">
          {images.map((image, itemIndex) => (
            <button
              key={image.id}
              type="button"
              aria-label={`查看第 ${itemIndex + 1} 张`}
              aria-pressed={itemIndex === activeIndex}
              onClick={() => goTo(itemIndex)}
              className={cn(
                'size-12 shrink-0 overflow-hidden rounded-lg border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-viewer-ink',
                itemIndex === activeIndex
                  ? 'border-viewer-ink'
                  : 'border-viewer-ink/25 hover:border-viewer-ink/60'
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
