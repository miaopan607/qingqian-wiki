import {
  Children,
  isValidElement,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
} from 'react'

import { cn } from './utils'

type MasonryPosition = { x: number; y: number }

type MasonryLayout = {
  signature: string
  columnWidth: number
  positions: MasonryPosition[]
  height: number
}

type MasonryMeasurement = {
  columns: number
  contentWidth: number
  gap: number
  heights: number[]
}

export type MasonryProps = ComponentPropsWithRef<'div'>

// 按最矮列依次放置，列高相同时优先左列。
export function computeMasonryLayout(
  heights: readonly number[],
  columns: number,
  columnWidth: number,
  gap: number
): { positions: MasonryPosition[]; height: number } {
  const columnHeights = Array.from({ length: columns }, () => 0)
  const positions = heights.map((itemHeight) => {
    let shortestColumn = 0
    for (let column = 1; column < columns; column += 1) {
      if (columnHeights[column] < columnHeights[shortestColumn]) shortestColumn = column
    }

    const y = columnHeights[shortestColumn]
    columnHeights[shortestColumn] += itemHeight + gap
    return { x: shortestColumn * (columnWidth + gap), y }
  })

  const height = positions.length > 0 ? Math.max(...columnHeights) - gap : 0
  return { positions, height: Math.max(0, height) }
}

function sameMeasurement(left: MasonryMeasurement | null, right: MasonryMeasurement): boolean {
  return Boolean(
    left &&
    left.columns === right.columns &&
    left.contentWidth === right.contentWidth &&
    left.gap === right.gap &&
    left.heights.length === right.heights.length &&
    left.heights.every((height, index) => height === right.heights[index])
  )
}

export function Masonry({ children, className, style, ref, ...props }: MasonryProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<MasonryLayout | null>(null)
  const items = Children.toArray(children)
  const keys = items.map((item, index) =>
    isValidElement(item) ? String(item.key ?? index) : String(index)
  )
  const signature = keys.join('\u0000')

  useImperativeHandle(ref, () => rootRef.current as HTMLDivElement, [ref])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return

    const itemElements = Array.from(root.children) as HTMLElement[]
    let frame: number | null = null
    let lastMeasurement: MasonryMeasurement | null = null

    const measure = () => {
      const computed = window.getComputedStyle(root)
      const parsedColumns = Number.parseInt(computed.getPropertyValue('--masonry-columns'), 10)
      const columns = Number.isFinite(parsedColumns) && parsedColumns > 0 ? parsedColumns : 1
      const parsedGap = Number.parseFloat(computed.columnGap)
      const gap = Number.isFinite(parsedGap) && parsedGap >= 0 ? parsedGap : 0
      const padding =
        (Number.parseFloat(computed.paddingLeft) || 0) +
        (Number.parseFloat(computed.paddingRight) || 0)
      const contentWidth = Math.max(0, root.clientWidth - padding)

      if (itemElements.length === 0) {
        const measurement = { columns, contentWidth, gap, heights: [] }
        if (!sameMeasurement(lastMeasurement, measurement)) {
          lastMeasurement = measurement
          setLayout({
            signature,
            columnWidth: 0,
            positions: [],
            height: 0,
          })
        }
        return
      }

      if (contentWidth === 0) return

      const columnWidth = Math.max(0, (contentWidth - (columns - 1) * gap) / columns)
      if (
        lastMeasurement?.contentWidth !== contentWidth ||
        lastMeasurement.columns !== columns ||
        lastMeasurement.gap !== gap
      ) {
        for (const item of itemElements) item.style.width = `${columnWidth}px`
      }
      const heights = itemElements.map((item) => {
        const height = item.getBoundingClientRect().height
        return Number.isFinite(height) ? Math.max(0, height) : 0
      })
      const measurement = { columns, contentWidth, gap, heights }
      if (sameMeasurement(lastMeasurement, measurement)) return

      lastMeasurement = measurement
      const result = computeMasonryLayout(heights, columns, columnWidth, gap)
      setLayout({ signature, columnWidth, ...result })
    }

    const scheduleMeasure = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        measure()
      })
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(root)
    itemElements.forEach((item) => observer.observe(item))
    window.addEventListener('resize', scheduleMeasure)
    scheduleMeasure()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [signature])

  const activeLayout = layout?.signature === signature ? layout : null

  return (
    <div
      {...props}
      ref={rootRef}
      className={cn('qq-masonry', className)}
      style={{
        ...style,
        ...(activeLayout ? { height: `${activeLayout.height}px` } : {}),
      }}
    >
      {items.map((item, index) => {
        const position = activeLayout?.positions[index]
        return (
          <div
            key={keys[index]}
            className="qq-masonry-item"
            style={
              activeLayout && position
                ? {
                    position: 'absolute',
                    width: `${activeLayout.columnWidth}px`,
                    transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                  }
                : undefined
            }
          >
            {item}
          </div>
        )
      })}
    </div>
  )
}
