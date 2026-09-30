import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ImageGrid } from '../../src/components/gallery/ImageGrid'
import { Lightbox } from '../../src/components/Lightbox'
import type { GalleryImageItem } from '../../src/types/entities'

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
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    if (element instanceof HTMLElement && element.classList.contains('qq-masonry')) {
      return {
        getPropertyValue: (property: string) => (property === '--masonry-columns' ? '2' : ''),
        columnGap: '12px',
        paddingLeft: '0px',
        paddingRight: '0px',
      } as CSSStyleDeclaration
    }
    return originalGetComputedStyle(element)
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    return this.classList.contains('qq-masonry') ? 300 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.classList.contains('qq-masonry-item')) {
      const [left, top] = this.style.transform
        .match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/)
        ?.slice(1)
        .map(Number) ?? [0, 0]
      const index = Array.from(this.parentElement?.children ?? []).indexOf(this)
      return rect(
        left,
        top,
        Number.parseFloat(this.style.width) || 0,
        [80, 180, 90, 220][index] ?? 0
      )
    }
    if (this.classList.contains('qq-masonry')) {
      return rect(0, 0, 300, Number.parseFloat(this.style.height) || 0)
    }
    return rect(0, 0, 0, 0)
  })
}

async function flushFrame() {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
}

const images: GalleryImageItem[] = Array.from({ length: 4 }, (_, index) => ({
  id: `image-${index + 1}`,
  assetId: `asset-${index + 1}`,
  url: `/images/${index + 1}.webp`,
  displayUrl: `/images/${index + 1}-display.webp`,
  thumbUrl: `/images/${index + 1}-thumb.webp`,
  width: index % 2 === 0 ? 1200 : 800,
  height: index % 2 === 0 ? 800 : 1200,
  blurhash: null,
  sortOrder: index,
}))

function GalleryWithLightbox() {
  const [index, setIndex] = useState<number | null>(null)
  return (
    <>
      <ImageGrid images={images} onOpen={setIndex} />
      {index !== null && <Lightbox images={images} index={index} onClose={() => setIndex(null)} />}
    </>
  )
}

afterEach(() => {
  ControlledResizeObserver.instances.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ImageGrid', () => {
  it('瀑布流重排后仍按原数组顺序打开图片并由灯箱顺序切换', async () => {
    installLayoutMocks()
    const { container } = render(<GalleryWithLightbox />)
    await act(async () => {
      ControlledResizeObserver.trigger()
      await flushFrame()
    })

    const root = container.querySelector('.qq-masonry') as HTMLElement
    const items = Array.from(root.querySelectorAll<HTMLElement>('.qq-masonry-item'))
    await waitFor(() => expect(root.style.height).toBe('412px'))
    expect(items.map((item) => item.getBoundingClientRect().left)).toEqual([0, 156, 0, 156])
    expect(
      screen
        .getAllByRole('button', { name: /查看第 \d 张图片/ })
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['查看第 1 张图片', '查看第 2 张图片', '查看第 3 张图片', '查看第 4 张图片'])

    fireEvent.click(screen.getByRole('button', { name: '查看第 3 张图片' }))
    expect(
      screen.getAllByRole('status').map((status) => status.textContent?.replace(/\s/g, ''))
    ).toContain('3/4')
    expect(document.querySelector('img[src="/images/3.webp"]')).toHaveAttribute('alt', '图片 3')

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(
      screen.getAllByRole('status').map((status) => status.textContent?.replace(/\s/g, ''))
    ).toContain('4/4')
    expect(document.querySelector('img[src="/images/4.webp"]')).toHaveAttribute('alt', '图片 4')
  })
})
