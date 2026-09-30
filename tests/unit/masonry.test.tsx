import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { computeMasonryLayout, Masonry } from '../../src/components/ui/Masonry'

class ControlledResizeObserver implements ResizeObserver {
  static instances = new Set<ControlledResizeObserver>()

  constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.instances.add(this)
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {
    ControlledResizeObserver.instances.delete(this)
  }

  static trigger(): void {
    for (const observer of ControlledResizeObserver.instances) {
      observer.callback([], observer)
    }
  }
}

let layoutWidth = 210
let layoutColumns = 2

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function installLayoutMocks() {
  vi.stubGlobal('ResizeObserver', ControlledResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0)
  )
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle))

  const originalGetComputedStyle = window.getComputedStyle.bind(window)
  const getComputedStyle = vi.spyOn(window, 'getComputedStyle')
  getComputedStyle.mockImplementation((element) => {
    if (element instanceof HTMLElement && element.classList.contains('qq-masonry')) {
      return {
        getPropertyValue: (property: string) =>
          property === '--masonry-columns' ? String(layoutColumns) : '',
        columnGap: '10px',
        paddingLeft: '0px',
        paddingRight: '0px',
      } as CSSStyleDeclaration
    }
    return originalGetComputedStyle(element)
  })

  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.classList.contains('qq-masonry')
      ? layoutWidth
      : Number.parseFloat(this.style.width) || 0
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.classList.contains('qq-masonry-item')) {
      const [left, top] = this.style.transform
        .match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/)
        ?.slice(1)
        .map(Number) ?? [0, 0]
      const child = this.firstElementChild as HTMLElement | null
      return rect(
        left,
        top,
        Number.parseFloat(this.style.width) || 0,
        Number(child?.dataset.height) || 0
      )
    }
    if (this.classList.contains('qq-masonry')) {
      return rect(0, 0, layoutWidth, Number.parseFloat(this.style.height) || 0)
    }
    return rect(0, 0, Number.parseFloat(this.style.width) || 0, Number(this.dataset.height) || 0)
  })
}

async function flushFrame() {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
}

afterEach(() => {
  ControlledResizeObserver.instances.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('computeMasonryLayout', () => {
  it('依次放入最短列，平高时优先左列，并返回内容高度', () => {
    expect(computeMasonryLayout([100, 200, 50, 80], 2, 100, 10)).toEqual({
      positions: [
        { x: 0, y: 0 },
        { x: 110, y: 0 },
        { x: 0, y: 110 },
        { x: 0, y: 170 },
      ],
      height: 250,
    })
    expect(computeMasonryLayout([100, 100, 50], 2, 100, 10).positions[2]).toEqual({
      x: 0,
      y: 110,
    })
  })

  it('支持空列表与单列布局', () => {
    expect(computeMasonryLayout([], 2, 100, 10)).toEqual({ positions: [], height: 0 })
    expect(computeMasonryLayout([5, 8], 1, 100, 2)).toEqual({
      positions: [
        { x: 0, y: 0 },
        { x: 0, y: 7 },
      ],
      height: 15,
    })
  })
})

describe('Masonry', () => {
  it('响应尺寸、隐藏恢复及列表变化重新布局，同时保持 DOM 顺序', async () => {
    installLayoutMocks()
    const makeItems = (heights: number[]) =>
      heights.map((height, index) => (
        <button key={`item-${index}`} data-height={height}>
          图片 {index + 1}
        </button>
      ))

    const { container, rerender } = render(
      <Masonry aria-label="图片瀑布流">{makeItems([100, 200, 50, 80])}</Masonry>
    )
    await waitFor(() =>
      expect(container.querySelector('.qq-masonry')?.getAttribute('style')).toContain(
        'height: 250px'
      )
    )

    const root = container.querySelector('.qq-masonry') as HTMLElement
    const items = () => Array.from(root.querySelectorAll<HTMLElement>('.qq-masonry-item'))
    expect(items().map((item) => item.getBoundingClientRect().left)).toEqual([0, 110, 0, 0])
    expect(items().map((item) => item.getBoundingClientRect().top)).toEqual([0, 0, 110, 170])
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      '图片 1',
      '图片 2',
      '图片 3',
      '图片 4',
    ])

    rerender(<Masonry aria-label="图片瀑布流">{makeItems([100, 200, 150, 80])}</Masonry>)
    await act(async () => {
      ControlledResizeObserver.trigger()
      await flushFrame()
    })
    await waitFor(() => expect(items()[3].getBoundingClientRect().top).toBe(210))

    layoutWidth = 100
    layoutColumns = 1
    await act(async () => {
      window.dispatchEvent(new Event('resize'))
      await flushFrame()
    })
    await waitFor(() => expect(root.style.height).toBe('560px'))
    expect(items().map((item) => item.getBoundingClientRect().left)).toEqual([0, 0, 0, 0])

    layoutWidth = 0
    await act(async () => {
      ControlledResizeObserver.trigger()
      await flushFrame()
    })
    expect(root.style.height).toBe('560px')

    layoutWidth = 210
    layoutColumns = 2
    await act(async () => {
      ControlledResizeObserver.trigger()
      await flushFrame()
    })
    await waitFor(() => expect(root.style.height).toBe('290px'))

    rerender(<Masonry aria-label="图片瀑布流">{makeItems([80, 120])}</Masonry>)
    await waitFor(() => expect(items()).toHaveLength(2))
    await waitFor(() => expect(root.style.height).toBe('120px'))
    rerender(<Masonry aria-label="图片瀑布流">{[]}</Masonry>)
    await waitFor(() => expect(items()).toHaveLength(0))
    await waitFor(() => expect(root.style.height).toBe('0px'))
  })
})
