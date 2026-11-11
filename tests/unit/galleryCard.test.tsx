import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it } from 'vitest'

import { GalleryCard } from '../../src/components/gallery/GalleryCard'
import type { GalleryItem } from '../../src/types/entities'

afterEach(cleanup)

it.each([
  { title: '精选照片', status: 'published' as const },
  { title: '', status: 'published' as const },
  { title: '', status: 'draft' as const },
])('图集名称展示：%j', ({ title, status }) => {
  const gallery: GalleryItem = {
    id: 'gallery-1',
    seq: 12,
    title,
    description: '',
    status,
    imagesCount: 3,
    cover: null,
    likesCount: 0,
    favoritesCount: 0,
    liked: false,
    favorited: false,
    authorName: '清浅',
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  render(
    <MemoryRouter>
      <GalleryCard gallery={gallery} />
    </MemoryRouter>
  )
  if (title) {
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
  } else {
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  }
  expect(screen.getByRole('link', { name: /第 12 组/ })).toHaveAttribute(
    'href',
    '/gallery/gallery-1'
  )
  expect(screen.getByText('3 张')).toBeInTheDocument()
  expect(Boolean(screen.queryByText('草稿'))).toBe(status === 'draft')
})
