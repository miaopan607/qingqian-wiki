import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Lightbox } from '../../src/components/Lightbox'

const images = [
  { id: 'a', url: '/uploads/a.png', displayUrl: '/uploads/a_d.webp', width: 1200, height: 800 },
  { id: 'b', url: '/uploads/b.png', displayUrl: '/uploads/b_d.webp', width: 800, height: 1200 },
]

function renderLightbox(onClose: () => void = () => {}) {
  return render(<Lightbox images={images} index={0} onClose={onClose} />)
}

describe('Lightbox', () => {
  it('方向键切换图片并显示当前序号', () => {
    renderLightbox()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 / 2')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
  })

  it('按 Esc 关闭', () => {
    const onClose = vi.fn()
    renderLightbox(onClose)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('点击背景关闭，拖拽背景不关闭', () => {
    const onClose = vi.fn()
    renderLightbox(onClose)

    const backdrop = document.querySelector('[data-lightbox-backdrop="true"]') as HTMLElement
    expect(backdrop).toBeTruthy()

    backdrop.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 })
    )
    backdrop.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 200 })
    )
    backdrop.dispatchEvent(
      new MouseEvent('pointerup', { bubbles: true, clientX: 200, clientY: 200 })
    )
    expect(onClose).not.toHaveBeenCalled()

    backdrop.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20 })
    )
    backdrop.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 21, clientY: 21 }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('缩略图条可跳转到指定图片', () => {
    renderLightbox()

    fireEvent.click(screen.getByRole('button', { name: '查看第 2 张' }))

    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })
})
