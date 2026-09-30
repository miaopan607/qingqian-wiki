import { Prisma } from '@prisma/client'
import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireAdmin } from '../middleware/auth'
import { apiKeyWriteLimiter } from '../middleware/rateLimit'
import { prisma } from '../prisma'
import {
  adminGalleryListQuerySchema,
  galleryCreateSchema,
  galleryUpdateSchema,
  validateBody,
  validateQuery,
} from '../schemas'
import { deleteAssetsIfUnreferenced, syncContentImages } from '../services/media.service'
import { AppError } from '../utils/appError'
import {
  GALLERY_DETAIL_INCLUDE,
  GALLERY_LIST_INCLUDE,
  toGalleryDetail,
  toGalleryListItem,
} from '../utils/responseTransformers'
import { readParam } from '../utils/routeParams'
import type { AuthenticatedRequest } from '../types'

const router = Router()

async function findNextSeq(): Promise<number> {
  const result = await prisma.gallery.aggregate({ _max: { seq: true } })
  return (result._max.seq ?? 0) + 1
}

router.get(
  '/',
  requireAdmin,
  validateQuery(adminGalleryListQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, status } = req.query as unknown as {
      page: number
      pageSize: number
      q?: string
      status?: 'draft' | 'published'
    }

    const where = {
      ...(status ? { status } : {}),
      ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
    }

    const [galleries, total, nextSeq] = await Promise.all([
      prisma.gallery.findMany({
        where,
        orderBy: { seq: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: GALLERY_LIST_INCLUDE,
      }),
      prisma.gallery.count({ where }),
      findNextSeq(),
    ])

    res.json({
      items: galleries.map((gallery) => toGalleryListItem(gallery)),
      total,
      page,
      pageSize,
      nextSeq,
    })
  })
)

router.get(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const gallery = await prisma.gallery.findUnique({
      where: { id: readParam(req.params.id) },
      include: GALLERY_DETAIL_INCLUDE,
    })
    if (!gallery) {
      res.status(404).json({ error: '图集不存在' })
      return
    }
    res.json({ gallery: toGalleryDetail(gallery) })
  })
)

router.post(
  '/',
  requireAdmin,
  apiKeyWriteLimiter,
  validateBody(galleryCreateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { seq, title, description, status, assetIds } = req.body as {
      seq?: number
      title: string
      description?: string
      status: 'draft' | 'published'
      assetIds: string[]
    }

    const nextSeq = seq ?? (await findNextSeq())

    const galleryId = await prisma
      .$transaction(async (tx) => {
        const gallery = await tx.gallery.create({
          data: {
            seq: nextSeq,
            title,
            description: description ?? '',
            status,
            authorUid: req.authUser!.uid,
            publishedAt: status === 'published' ? new Date() : null,
          },
          select: { id: true },
        })

        await syncContentImages(tx, { type: 'gallery', id: gallery.id }, assetIds)
        return gallery.id
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new AppError('该序号已被占用', 409)
        }
        throw error
      })

    const gallery = await prisma.gallery.findUniqueOrThrow({
      where: { id: galleryId },
      include: GALLERY_DETAIL_INCLUDE,
    })
    res.status(201).json({ gallery: toGalleryDetail(gallery) })
  })
)

router.patch(
  '/:id',
  requireAdmin,
  apiKeyWriteLimiter,
  validateBody(galleryUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = readParam(req.params.id)
    const { seq, title, description, status, assetIds } = req.body as {
      seq?: number
      title?: string
      description?: string
      status?: 'draft' | 'published'
      assetIds?: string[]
    }

    const existing = await prisma.gallery.findUnique({
      where: { id },
      select: { id: true, publishedAt: true },
    })
    if (!existing) {
      res.status(404).json({ error: '图集不存在' })
      return
    }

    const removedAssetIds = await prisma
      .$transaction(async (tx) => {
        await tx.gallery.update({
          where: { id },
          data: {
            ...(seq === undefined ? {} : { seq }),
            ...(title === undefined ? {} : { title }),
            ...(description === undefined ? {} : { description }),
            ...(status === undefined
              ? {}
              : {
                  status,
                  publishedAt: status === 'published' ? (existing.publishedAt ?? new Date()) : null,
                }),
          },
        })

        if (!assetIds) return []
        return syncContentImages(tx, { type: 'gallery', id }, assetIds)
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new AppError('该序号已被占用', 409)
        }
        throw error
      })

    await deleteAssetsIfUnreferenced(removedAssetIds)

    const gallery = await prisma.gallery.findUniqueOrThrow({
      where: { id },
      include: GALLERY_DETAIL_INCLUDE,
    })
    res.json({ gallery: toGalleryDetail(gallery) })
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = readParam(req.params.id)
    const existing = await prisma.gallery.findUnique({
      where: { id },
      select: { id: true, images: { select: { assetId: true } } },
    })
    if (!existing) {
      res.status(404).json({ error: '图集不存在' })
      return
    }

    await prisma.gallery.delete({ where: { id } })
    await deleteAssetsIfUnreferenced(existing.images.map((image) => image.assetId))

    res.json({ success: true })
  })
)

export function registerAdminGalleryRoutes(app: Router) {
  app.use('/api/admin/galleries', router)
}
