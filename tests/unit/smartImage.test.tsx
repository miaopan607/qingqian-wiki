import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SmartImage } from '../../src/components/SmartImage'

describe('SmartImage', () => {
  it('保留有效尺寸比例并完整显示图片，失败时维持占位高度', () => {
    const { container } = render(
      <SmartImage
        src="/photo.webp"
        alt="风景"
        width={1200}
        height={800}
        priority
        wrapperClassName="w-full"
      />
    )

    const image = screen.getByRole('img', { name: '风景' })
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.style.aspectRatio).toBe('1200 / 800')

    fireEvent.error(image)
    expect(wrapper.style.aspectRatio).toBe('1200 / 800')
    expect(wrapper).toHaveTextContent('图片加载失败')
  })

  it('尺寸缺失、为零或无效时使用稳定的 4:3 比例', () => {
    const { container, rerender } = render(<SmartImage src="/photo.webp" alt="缺少尺寸" />)
    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe('4 / 3')

    rerender(<SmartImage src="/photo.webp" alt="零尺寸" width={0} height={800} />)
    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe('4 / 3')

    rerender(<SmartImage src="/photo.webp" alt="无效尺寸" width={Number.NaN} height={800} />)
    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe('4 / 3')
  })

  it('无图片时也保留确定的占位比例', () => {
    const { container } = render(<SmartImage src={null} alt="空封面" width={640} height={480} />)

    expect(screen.getByText('暂无图片')).toBeInTheDocument()
    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe('640 / 480')
  })
})
