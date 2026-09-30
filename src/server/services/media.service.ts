import type { MediaAsset, Prisma } from '@prisma/client'

import { prisma } from '../prisma'
import { deleteImageFiles, type ProcessedImage } from './image.service'
import { getStorageDriver, type StorageDriverId } from './storage'

const ORPHAN_GRACE_MS = 60 * 60 * 1000

export type AssetUrls = {
  url: string
  displayUrl: string
  thumbUrl: string
}

export type AssetLike = {
  driver: StorageDriverId
  storageKey: string
  displayKey: string | null
  thumbKey: string | null
}

// 图片 URL 一律按资产自身记录的驱动解析，切换存储驱动不影响历史数据
export function resolveAssetUrls(asset: AssetLike): AssetUrls {
  const driver = getStorageDriver(asset.driver)
  return {
    url: driver.url(asset.storageKey),
    displayUrl: driver.url(asset.displayKey ?? asset.storageKey),
    thumbUrl: driver.url(asset.thumbKey ?? asset.storageKey),
  }
}

export function toAssetResponse(asset: MediaAsset) {
  return {
    id: asset.id,
    ...resolveAssetUrls(asset),
    width: asset.width,
    height: asset.height,
    blurhash: asset.blurhash,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
  }
}

export async function createAsset(input: {
  id: string
  ownerUid: string
  kind: 'image' | 'avatar'
  driverId: StorageDriverId
  processed: ProcessedImage
}): Promise<MediaAsset> {
  return prisma.mediaAsset.create({
    data: {
      id: input.id,
      ownerUid: input.ownerUid,
      kind: input.kind,
      driver: input.driverId,
      storageKey: input.processed.originalKey,
      displayKey: input.processed.displayKey,
      thumbKey: input.processed.thumbKey,
      mimeType: input.processed.originalMime,
      sizeBytes: input.processed.originalSize,
      width: input.processed.width,
      height: input.processed.height,
      blurhash: input.processed.blurhash,
    },
  })
}

async function countReferences(assetId: string): Promise<number> {
  const [galleryImages, keycapImages, avatars] = await Promise.all([
    prisma.galleryImage.count({ where: { assetId } }),
    prisma.keycapImage.count({ where: { assetId } }),
    prisma.user.count({ where: { avatarAssetId: assetId } }),
  ])
  return galleryImages + keycapImages + avatars
}

async function deleteAssetWithFiles(asset: MediaAsset): Promise<void> {
  await deleteImageFiles(asset)
  await prisma.mediaAsset.delete({ where: { id: asset.id } })
}

// 内容更新后清理不再被任何位置引用的资产（含文件）
export async function deleteAssetsIfUnreferenced(assetIds: string[]): Promise<number> {
  if (assetIds.length === 0) return 0

  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: assetIds } } })
  let deleted = 0

  for (const asset of assets) {
    if ((await countReferences(asset.id)) > 0) continue
    try {
      await deleteAssetWithFiles(asset)
      deleted += 1
    } catch {
      // 单个资产删除失败不阻断其它清理，交给后台「清理未引用图片」重试
    }
  }

  return deleted
}

// 回滚「已上传但未保存」的资产：仍被引用时返回 false
export async function deleteAssetById(assetId: string): Promise<boolean> {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } })
  if (!asset) return false
  if ((await countReferences(assetId)) > 0) return false

  await deleteAssetWithFiles(asset)
  return true
}

export async function purgeOrphanAssets(olderThanMs = ORPHAN_GRACE_MS): Promise<number> {
  const threshold = new Date(Date.now() - olderThanMs)
  const assets = await prisma.mediaAsset.findMany({
    where: { createdAt: { lt: threshold } },
    select: { id: true },
  })
  return deleteAssetsIfUnreferenced(assets.map((asset) => asset.id))
}

// 按提交顺序重建内容图片：返回被移除的资产 id（由调用方在事务提交后清理）
export async function syncContentImages(
  tx: Prisma.TransactionClient,
  target: { type: 'gallery'; id: string } | { type: 'keycap'; id: string },
  assetIds: string[]
): Promise<string[]> {
  const uniqueAssetIds = Array.from(new Set(assetIds))

  if (target.type === 'gallery') {
    const existing = await tx.galleryImage.findMany({
      where: { galleryId: target.id },
      select: { assetId: true },
    })
    const existingIds = existing.map((row) => row.assetId)
    const removed = existingIds.filter((assetId) => !uniqueAssetIds.includes(assetId))

    if (removed.length > 0) {
      await tx.galleryImage.deleteMany({
        where: { galleryId: target.id, assetId: { in: removed } },
      })
    }

    for (const [index, assetId] of uniqueAssetIds.entries()) {
      if (existingIds.includes(assetId)) {
        await tx.galleryImage.update({
          where: { galleryId_assetId: { galleryId: target.id, assetId } },
          data: { sortOrder: index },
        })
      } else {
        await tx.galleryImage.create({
          data: { galleryId: target.id, assetId, sortOrder: index },
        })
      }
    }

    return removed
  }

  const existing = await tx.keycapImage.findMany({
    where: { keycapId: target.id },
    select: { assetId: true },
  })
  const existingIds = existing.map((row) => row.assetId)
  const removed = existingIds.filter((assetId) => !uniqueAssetIds.includes(assetId))

  if (removed.length > 0) {
    await tx.keycapImage.deleteMany({
      where: { keycapId: target.id, assetId: { in: removed } },
    })
  }

  for (const [index, assetId] of uniqueAssetIds.entries()) {
    if (existingIds.includes(assetId)) {
      await tx.keycapImage.update({
        where: { keycapId_assetId: { keycapId: target.id, assetId } },
        data: { sortOrder: index },
      })
    } else {
      await tx.keycapImage.create({
        data: { keycapId: target.id, assetId, sortOrder: index },
      })
    }
  }

  return removed
}
