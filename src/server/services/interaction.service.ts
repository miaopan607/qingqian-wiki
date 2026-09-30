import { prisma } from '../prisma'
import type { GalleryInteraction } from '../utils/responseTransformers'

// 列表页一次性取回当前用户在本页图集上的点赞/收藏状态
export async function loadGalleryInteractions(
  userUid: string | null,
  galleryIds: string[]
): Promise<Map<string, GalleryInteraction>> {
  const result = new Map<string, GalleryInteraction>()
  if (!userUid || galleryIds.length === 0) return result

  const [likes, favorites] = await Promise.all([
    prisma.galleryLike.findMany({
      where: { userUid, galleryId: { in: galleryIds } },
      select: { galleryId: true },
    }),
    prisma.favorite.findMany({
      where: { userUid, galleryId: { in: galleryIds } },
      select: { galleryId: true },
    }),
  ])

  const likedIds = new Set(likes.map((row) => row.galleryId))
  const favoritedIds = new Set(favorites.map((row) => row.galleryId))

  for (const galleryId of galleryIds) {
    result.set(galleryId, {
      liked: likedIds.has(galleryId),
      favorited: favoritedIds.has(galleryId),
    })
  }

  return result
}

export async function toggleGalleryLike(
  userUid: string,
  galleryId: string
): Promise<{ liked: boolean; likesCount: number }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.galleryLike.findUnique({
      where: { galleryId_userUid: { galleryId, userUid } },
    })

    if (existing) {
      await tx.galleryLike.delete({ where: { id: existing.id } })
      const gallery = await tx.gallery.update({
        where: { id: galleryId },
        data: { likesCount: { decrement: 1 } },
        select: { likesCount: true },
      })
      return { liked: false, likesCount: Math.max(0, gallery.likesCount) }
    }

    await tx.galleryLike.create({ data: { galleryId, userUid } })
    const gallery = await tx.gallery.update({
      where: { id: galleryId },
      data: { likesCount: { increment: 1 } },
      select: { likesCount: true },
    })
    return { liked: true, likesCount: gallery.likesCount }
  })
}

export async function toggleGalleryFavorite(
  userUid: string,
  galleryId: string
): Promise<{ favorited: boolean; favoritesCount: number }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.favorite.findUnique({
      where: { galleryId_userUid: { galleryId, userUid } },
    })

    if (existing) {
      await tx.favorite.delete({ where: { id: existing.id } })
      const gallery = await tx.gallery.update({
        where: { id: galleryId },
        data: { favoritesCount: { decrement: 1 } },
        select: { favoritesCount: true },
      })
      return { favorited: false, favoritesCount: Math.max(0, gallery.favoritesCount) }
    }

    await tx.favorite.create({ data: { galleryId, userUid } })
    const gallery = await tx.gallery.update({
      where: { id: galleryId },
      data: { favoritesCount: { increment: 1 } },
      select: { favoritesCount: true },
    })
    return { favorited: true, favoritesCount: gallery.favoritesCount }
  })
}
