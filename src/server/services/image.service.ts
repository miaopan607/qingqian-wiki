import { encode as encodeBlurhash } from 'blurhash'
import sharp from 'sharp'

import { ImageProcessingError } from '../utils/appError'
import { logger } from '../utils/logger'
import { buildObjectKey, getStorageDriver, type StorageDriverId } from './storage'

export const UPLOAD_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
export const UPLOAD_MAX_FILE_SIZE_MB = 20
export const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'] as const
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
] as const

const DISPLAY_MAX_SIZE = 2400
const THUMB_MAX_SIZE = 720
const AVATAR_SIZE = 512

const SUPPORTED_FORMATS = ['jpeg', 'png', 'webp', 'gif', 'bmp'] as const
const MIME_BY_FORMAT: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
}

sharp.concurrency(Number(process.env.SHARP_CONCURRENCY) || 1)
sharp.cache(false)

export type ProcessedImage = {
  originalKey: string
  originalMime: string
  originalSize: number
  displayKey: string | null
  thumbKey: string
  width: number
  height: number
  blurhash: string | null
}

function getSharpOptions() {
  return {
    limitInputPixels: Number(process.env.SHARP_MAX_INPUT_PIXELS) || 25_000_000,
    failOn: 'error' as const,
  }
}

// 读取真实格式与尺寸；无法解码（含伪扩展名）即拒绝
async function readImageMetadata(input: Buffer) {
  let metadata: { format?: string; width?: number; height?: number }
  try {
    metadata = await sharp(input, getSharpOptions()).metadata()
  } catch {
    throw new ImageProcessingError('无法解析的图片文件', 400)
  }

  const format = metadata.format
  if (!format || !SUPPORTED_FORMATS.includes(format as (typeof SUPPORTED_FORMATS)[number])) {
    throw new ImageProcessingError('无法解析的图片文件', 400)
  }
  if (!metadata.width || !metadata.height) {
    throw new ImageProcessingError('无法解析的图片文件', 400)
  }

  return { format, width: metadata.width, height: metadata.height }
}

async function computeBlurhash(input: Buffer): Promise<string | null> {
  try {
    const { data, info } = await sharp(input, getSharpOptions())
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    return encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3)
  } catch {
    return null
  }
}

// 上传成功但后续步骤失败时清理已写入的派生文件
async function cleanupWritten(driverId: StorageDriverId, keys: string[]): Promise<void> {
  const driver = getStorageDriver(driverId)
  await Promise.allSettled(keys.map((key) => driver.delete(key)))
}

// 图集/键帽图片：原图保持字节不变，另生成详情图与列表缩略图
export async function processGalleryImage(
  input: Buffer,
  assetId: string,
  driverId: StorageDriverId
): Promise<ProcessedImage> {
  const { format, width, height } = await readImageMetadata(input)
  const driver = getStorageDriver(driverId)
  const ext = format === 'jpeg' ? 'jpg' : format
  const originalMime = MIME_BY_FORMAT[format]

  const originalKey = buildObjectKey('images', assetId, 'o', ext)
  // GIF 详情图仍用原图，保留动画
  const displayKey = format === 'gif' ? null : buildObjectKey('images', assetId, 'd', 'webp')
  const thumbKey = buildObjectKey('images', assetId, 't', 'webp')

  const written: string[] = []
  try {
    await driver.put(originalKey, input, originalMime)
    written.push(originalKey)

    if (displayKey) {
      const displayBuffer = await sharp(input, getSharpOptions())
        .rotate()
        .resize(DISPLAY_MAX_SIZE, DISPLAY_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
      await driver.put(displayKey, displayBuffer, 'image/webp')
      written.push(displayKey)
    }

    const thumbBuffer = await sharp(input, getSharpOptions())
      .rotate()
      .resize(THUMB_MAX_SIZE, THUMB_MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toBuffer()
    await driver.put(thumbKey, thumbBuffer, 'image/webp')
    written.push(thumbKey)
  } catch (error) {
    await cleanupWritten(driverId, written)
    if (error instanceof ImageProcessingError) throw error
    logger.error({ err: error, assetId }, 'Store gallery image failed')
    throw new ImageProcessingError('图片处理失败，请稍后重试', 400)
  }

  return {
    originalKey,
    originalMime,
    originalSize: input.length,
    displayKey,
    thumbKey,
    width,
    height,
    blurhash: await computeBlurhash(input),
  }
}

// 头像：前端已裁剪，这里按 512x512 覆盖裁切兜底
export async function processAvatarImage(
  input: Buffer,
  assetId: string,
  driverId: StorageDriverId
): Promise<ProcessedImage> {
  await readImageMetadata(input)
  const driver = getStorageDriver(driverId)
  const key = buildObjectKey('avatars', assetId, 'a', 'webp')

  let avatarBuffer: Buffer
  try {
    avatarBuffer = await sharp(input, getSharpOptions())
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    throw new ImageProcessingError('图片处理失败，请稍后重试', 400)
  }

  try {
    await driver.put(key, avatarBuffer, 'image/webp')
  } catch (error) {
    logger.error({ err: error, assetId }, 'Store avatar image failed')
    throw new ImageProcessingError('图片处理失败，请稍后重试', 400)
  }

  return {
    originalKey: key,
    originalMime: 'image/webp',
    originalSize: avatarBuffer.length,
    displayKey: null,
    thumbKey: key,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    blurhash: null,
  }
}

export async function deleteImageFiles(asset: {
  driver: StorageDriverId
  storageKey: string
  displayKey: string | null
  thumbKey: string | null
}): Promise<void> {
  const keys = [asset.storageKey, asset.displayKey, asset.thumbKey].filter((key): key is string =>
    Boolean(key)
  )
  await cleanupWritten(asset.driver, Array.from(new Set(keys)))
}

export function isAllowedImageFile(file: { mimetype: string; originalname: string }): boolean {
  const ext = file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
  const mime = (file.mimetype || '').toLowerCase()
  return (
    ALLOWED_IMAGE_EXTENSIONS.includes(ext as (typeof ALLOWED_IMAGE_EXTENSIONS)[number]) &&
    ALLOWED_IMAGE_MIME_TYPES.includes(mime as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])
  )
}
