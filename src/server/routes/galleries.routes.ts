import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireActiveUser } from '../middleware/auth'
import { writeLimiter } from '../middleware/rateLimit'
import { prisma } from '../prisma'
import { publicListQuerySchema, validateQuery } from '../schemas'
import {
  loadGalleryInteractions,
  toggleGalleryFavorite,
  toggleGalleryLike,
} from '../services/interaction.service'
import type { AuthenticatedRequest } from '../types'
import {
  GALLERY_DETAIL_INCLUDE,
  GALLERY_LIST_INCLUDE,
  toGalleryDetail,
  toGalleryListItem,
} from '../utils/responseTransformers'
import { readParam } from '../utils/routeParams'

const router = Router()

router.get(
  '/',
  validateQuery(publicListQuerySchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number }
    const where = { status: 'published' as const }

    const [galleries, total] = await Promise.all([
      prisma.gallery.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: GALLERY_LIST_INCLUDE,
      }),
      prisma.gallery.count({ where }),
    ])

    const interactions = await loadGalleryInteractions(
      req.authUser?.uid ?? null,
      galleries.map((gallery) => gallery.id)
    )

    res.json({
      items: galleries.map((gallery) => toGalleryListItem(gallery, interactions.get(gallery.id))),
      total,
      page,
      pageSize,
    })
  })
)

router.get(
  '/:id',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const gallery = await prisma.gallery.findUnique({
      where: { id: readParam(req.params.id) },
      include: GALLERY_DETAIL_INCLUDE,
    })

    const isAdmin = req.authUser?.role === 'admin' || req.authUser?.role === 'super_admin'
    if (!gallery || (gallery.status !== 'published' && !isAdmin)) {
      res.status(404).json({ error: '图集不存在' })
      return
    }

    const interactions = await loadGalleryInteractions(req.authUser?.uid ?? null, [gallery.id])
    res.json({ gallery: toGalleryDetail(gallery, interactions.get(gallery.id)) })
  })
)

router.post(
  '/:id/like',
  requireActiveUser,
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const gallery = await prisma.gallery.findUnique({
      where: { id: readParam(req.params.id) },
      select: { id: true },
    })
    if (!gallery) {
      res.status(404).json({ error: '图集不存在' })
      return
    }

    res.json(await toggleGalleryLike(req.authUser!.uid, gallery.id))
  })
)

router.post(
  '/:id/favorite',
  requireActiveUser,
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const gallery = await prisma.gallery.findUnique({
      where: { id: readParam(req.params.id) },
      select: { id: true },
    })
    if (!gallery) {
      res.status(404).json({ error: '图集不存在' })
      return
    }

    res.json(await toggleGalleryFavorite(req.authUser!.uid, gallery.id))
  })
)

export function registerGalleriesRoutes(app: Router) {
  app.use('/api/galleries', router)
}
