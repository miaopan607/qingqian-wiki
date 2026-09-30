import fs from 'fs/promises'
import path from 'path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { processAvatarImage, processGalleryImage } from '../../src/server/services/image.service'
import { ImageProcessingError } from '../../src/server/utils/appError'
import { getUploadsDir } from '../../src/server/utils/uploadsPath'

async function createImage(
  width: number,
  height: number,
  format: 'png' | 'jpeg' | 'gif' | 'webp'
): Promise<Buffer> {
  const pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 130, b: 150 } },
  })

  if (format === 'png') return pipeline.png().toBuffer()
  if (format === 'jpeg') return pipeline.jpeg().toBuffer()
  if (format === 'gif') return pipeline.gif().toBuffer()
  return pipeline.webp().toBuffer()
}

describe('processGalleryImage', () => {
  it('生成原图、详情图与缩略图三档产物', async () => {
    const assetId = `unit-${Date.now()}`
    const input = await createImage(3000, 2000, 'png')

    const result = await processGalleryImage(input, assetId, 'local')

    expect(result.originalKey.endsWith('_o.png')).toBe(true)
    expect(result.displayKey?.endsWith('_d.webp')).toBe(true)
    expect(result.thumbKey.endsWith('_t.webp')).toBe(true)
    expect(result.width).toBe(3000)
    expect(result.height).toBe(2000)
    expect(result.blurhash).toBeTruthy()

    const displayPath = path.join(getUploadsDir(), result.displayKey!)
    const thumbPath = path.join(getUploadsDir(), result.thumbKey)
    const originalPath = path.join(getUploadsDir(), result.originalKey)

    const displayMeta = await sharp(displayPath).metadata()
    expect(displayMeta.format).toBe('webp')
    expect(Math.max(displayMeta.width ?? 0, displayMeta.height ?? 0)).toBeLessThanOrEqual(2400)

    const thumbMeta = await sharp(thumbPath).metadata()
    expect(thumbMeta.format).toBe('webp')
    expect(Math.max(thumbMeta.width ?? 0, thumbMeta.height ?? 0)).toBeLessThanOrEqual(720)

    // 原图保持原始字节
    const originalBytes = await fs.readFile(originalPath)
    expect(originalBytes.equals(input)).toBe(true)
  })

  it('不放大尺寸不足的图片', async () => {
    const assetId = `unit-small-${Date.now()}`
    const input = await createImage(400, 300, 'jpeg')

    const result = await processGalleryImage(input, assetId, 'local')
    const thumbMeta = await sharp(path.join(getUploadsDir(), result.thumbKey)).metadata()

    expect(thumbMeta.width).toBe(400)
    expect(thumbMeta.height).toBe(300)
  })

  it('GIF 不生成详情图（保留动画原图）', async () => {
    const assetId = `unit-gif-${Date.now()}`
    const input = await createImage(200, 200, 'gif')

    const result = await processGalleryImage(input, assetId, 'local')

    expect(result.displayKey).toBeNull()
    expect(result.originalMime).toBe('image/gif')
    expect(result.thumbKey.endsWith('_t.webp')).toBe(true)
  })

  it('拒绝无法解码的文件（伪扩展名）', async () => {
    const input = Buffer.from('this is definitely not an image')

    await expect(
      processGalleryImage(input, `unit-bad-${Date.now()}`, 'local')
    ).rejects.toBeInstanceOf(ImageProcessingError)
  })
})

describe('processAvatarImage', () => {
  it('统一裁切为 512x512 webp', async () => {
    const assetId = `avatar-${Date.now()}`
    const input = await createImage(1200, 800, 'jpeg')

    const result = await processAvatarImage(input, assetId, 'local')

    expect(result.width).toBe(512)
    expect(result.height).toBe(512)
    expect(result.displayKey).toBeNull()
    expect(result.originalKey).toBe(result.thumbKey)

    const meta = await sharp(path.join(getUploadsDir(), result.originalKey)).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.width).toBe(512)
  })
})
