import { afterEach, describe, expect, it } from 'vitest'

import { resolveAssetUrls } from '../../src/server/services/media.service'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('resolveAssetUrls', () => {
  it('本地资产返回 /uploads 路径', () => {
    const urls = resolveAssetUrls({
      driver: 'local',
      storageKey: 'images/2026/09/a_o.png',
      displayKey: 'images/2026/09/a_d.webp',
      thumbKey: 'images/2026/09/a_t.webp',
    })

    expect(urls).toEqual({
      url: '/uploads/images/2026/09/a_o.png',
      displayUrl: '/uploads/images/2026/09/a_d.webp',
      thumbUrl: '/uploads/images/2026/09/a_t.webp',
    })
  })

  it('缺少派生图时回退到原图', () => {
    const urls = resolveAssetUrls({
      driver: 'local',
      storageKey: 'images/2026/09/b_o.gif',
      displayKey: null,
      thumbKey: null,
    })

    expect(urls.displayUrl).toBe('/uploads/images/2026/09/b_o.gif')
    expect(urls.thumbUrl).toBe('/uploads/images/2026/09/b_o.gif')
  })

  it('对象存储资产按记录中的驱动解析', () => {
    process.env.S3_BUCKET = 'qingqian'
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com'
    process.env.S3_PREFIX = 'media'

    const urls = resolveAssetUrls({
      driver: 's3',
      storageKey: 'images/2026/09/c_o.png',
      displayKey: 'images/2026/09/c_d.webp',
      thumbKey: 'images/2026/09/c_t.webp',
    })

    expect(urls.url).toBe('https://cdn.example.com/media/images/2026/09/c_o.png')
    expect(urls.thumbUrl).toBe('https://cdn.example.com/media/images/2026/09/c_t.webp')
  })
})
