import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Lightbox } from '../../src/components/Lightbox'

const images = [
  { id: 'a', url: '/uploads/a.png', displayUrl: '/uploads/a_d.webp', width: 8000, height: 6000 },
  { id: 'b', url: '/uploads/b.png', displayUrl: '/uploads/b_d.webp', width: 800, height: 1200 },
]

function renderLightbox(onClose: () => void = () => {}) {
  return render(<Lightbox images={images} index={0} onClose={onClose} />)
}
function stage() {
  return document.querySelector('[data-lightbox-backdrop="true"]') as HTMLElement
}
function loadImage(width = 8000, height = 6000) {
  const image = screen.getByAltText(/图片 \d/) as HTMLImageElement
  Object.defineProperties(image, {
    naturalWidth: { value: width, configurable: true },
    naturalHeight: { value: height, configurable: true },
  })
  fireEvent.load(image)
  return image
}
function pointer(target: HTMLElement, type: string, id: number, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: id })
  fireEvent(target, event)
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
})
afterEach(() => vi.restoreAllMocks())

describe('Lightbox', () => {
  it('方向键和缩略图切换图片，当前缩略图不会重新进入加载', () => {
    renderLightbox()
    loadImage()
    fireEvent.click(screen.getByRole('button', { name: '查看第 1 张' }))
    expect(screen.queryByText('加载中…')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看第 2 张' }))
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('加载原图，超大图片的实际大小仍然是 1:1', () => {
    renderLightbox()
    const image = loadImage()
    expect(image).toHaveAttribute('src', '/uploads/a.png')
    expect(screen.getByLabelText('缩放比例')).toHaveTextContent('10%')
    fireEvent.click(screen.getByRole('button', { name: '实际大小' }))
    expect(screen.getByLabelText('缩放比例')).toHaveTextContent('100%')
    expect(image.style.transform).toContain('scale(1)')
    fireEvent.click(screen.getByRole('button', { name: '适应窗口' }))
    expect(screen.getByLabelText('缩放比例')).toHaveTextContent('10%')
  })

  it('图片失败时结束加载，重试后可重新显示', () => {
    renderLightbox()
    fireEvent.error(screen.getByAltText('图片 1'))
    expect(screen.getByRole('alert')).toHaveTextContent('图片加载失败')
    expect(screen.queryByText('加载中…')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(screen.getByText('加载中…')).toBeInTheDocument()
    loadImage()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('缩放比例')).toHaveTextContent('10%')
  })

  it('背景可点击关闭，图片点击、拖动及取消手势不会关闭', () => {
    const onClose = vi.fn()
    renderLightbox(onClose)
    const image = loadImage()
    pointer(image, 'pointerdown', 1, 20, 20)
    pointer(image, 'pointerup', 1, 20, 20)
    pointer(stage(), 'pointerdown', 1, 20, 20)
    pointer(stage(), 'pointermove', 1, 200, 200)
    pointer(stage(), 'pointerup', 1, 200, 200)
    pointer(stage(), 'pointerdown', 1, 20, 20)
    pointer(stage(), 'pointercancel', 1, 20, 20)
    expect(onClose).not.toHaveBeenCalled()
    pointer(stage(), 'pointerdown', 1, 20, 20)
    pointer(stage(), 'pointerup', 1, 21, 21)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('放大拖动后缩小到窗口以内，会清除越界偏移', () => {
    renderLightbox()
    const image = loadImage()
    fireEvent.click(screen.getByRole('button', { name: '实际大小' }))
    pointer(image, 'pointerdown', 1, 100, 100)
    pointer(stage(), 'pointermove', 1, 500, 400)
    pointer(stage(), 'pointerup', 1, 500, 400)
    expect(image.style.transform).toContain('translate3d(400px, 300px, 0)')
    fireEvent.wheel(stage(), { deltaY: 2000, clientX: 0, clientY: 0 })
    expect(image.style.transform).toContain('translate3d(0px, 0px, 0)')
  })

  it('双指结束后剩余手指能连续拖动，不误切图或关闭', () => {
    const onClose = vi.fn()
    renderLightbox(onClose)
    const image = loadImage(1600, 1200)
    fireEvent.click(screen.getByRole('button', { name: '实际大小' }))
    pointer(image, 'pointerdown', 1, 100, 100)
    pointer(image, 'pointerdown', 2, 200, 100)
    pointer(stage(), 'pointermove', 2, 300, 100)
    pointer(stage(), 'pointerup', 2, 300, 100)
    const before = image.style.transform
    pointer(stage(), 'pointermove', 1, 130, 120)
    pointer(stage(), 'pointerup', 1, 130, 120)
    expect(image.style.transform).not.toBe(before)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('适应窗口时横滑切图，但取消横滑不会切图', () => {
    renderLightbox()
    const image = loadImage()
    pointer(image, 'pointerdown', 1, 200, 100)
    pointer(stage(), 'pointermove', 1, 100, 100)
    pointer(stage(), 'pointercancel', 1, 100, 100)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    pointer(image, 'pointerdown', 1, 200, 100)
    pointer(stage(), 'pointerup', 1, 100, 100)
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('焦点在灯箱内循环，Esc 关闭后回到触发按钮', () => {
    function Viewer() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>打开图片</button>
          {open && <Lightbox images={images} index={0} onClose={() => setOpen(false)} />}
        </>
      )
    }
    render(<Viewer />)
    const trigger = screen.getByRole('button', { name: '打开图片' })
    trigger.focus()
    fireEvent.click(trigger)
    loadImage()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    const first = screen.getByRole('button', { name: '缩小' })
    const last = screen.getByRole('button', { name: '查看第 2 张' })
    first.focus()
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('StrictMode 打开后返回只关闭灯箱，并保留原页面历史状态', async () => {
    const initialState = { page: 'gallery' }
    window.history.replaceState(initialState, '')
    const onClose = vi.fn()
    render(
      <StrictMode>
        <Lightbox images={images} index={0} onClose={onClose} />
      </StrictMode>
    )
    await waitFor(() => expect(window.history.state?.lightboxKey).toBeTruthy())
    await act(async () => {
      window.history.back()
      await new Promise<void>((resolve) =>
        window.addEventListener('popstate', () => resolve(), { once: true })
      )
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(window.history.state).toEqual(initialState)
  })
})
