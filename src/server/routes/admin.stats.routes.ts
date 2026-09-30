import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireAdmin } from '../middleware/auth'
import { prisma } from '../prisma'
import {
  GALLERY_LIST_INCLUDE,
  KEYCAP_LIST_INCLUDE,
  toGalleryListItem,
  toKeycapListItem,
} from '../utils/responseTransformers'

const router = Router()

router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [
      galleries,
      publishedGalleries,
      keycaps,
      images,
      users,
      bannedUsers,
      orphanAssets,
      latestGalleries,
      latestKeycaps,
    ] = await Promise.all([
      prisma.gallery.count(),
      prisma.gallery.count({ where: { status: 'published' } }),
      prisma.keycap.count(),
      prisma.mediaAsset.count(),
      prisma.user.count(),
      prisma.user.count({ where: { status: 'banned' } }),
      prisma.mediaAsset.count({
        where: {
          galleryImages: { none: {} },
          keycapImages: { none: {} },
          userAvatars: { none: {} },
        },
      }),
      prisma.gallery.findMany({
        orderBy: { seq: 'desc' },
        take: 5,
        include: GALLERY_LIST_INCLUDE,
      }),
      prisma.keycap.findMany({
        orderBy: { seq: 'desc' },
        take: 5,
        include: KEYCAP_LIST_INCLUDE,
      }),
    ])

    res.json({
      galleries,
      publishedGalleries,
      keycaps,
      images,
      users,
      bannedUsers,
      orphanAssets,
      latestGalleries: latestGalleries.map((gallery) => toGalleryListItem(gallery)),
      latestKeycaps: latestKeycaps.map(toKeycapListItem),
    })
  })
)

export function registerAdminStatsRoutes(app: Router) {
  app.use('/api/admin/stats', router)
}
