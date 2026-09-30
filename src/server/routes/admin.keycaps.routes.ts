import { Prisma } from '@prisma/client'
import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireAdmin } from '../middleware/auth'
import { prisma } from '../prisma'
import {
  adminKeycapListQuerySchema,
  keycapCreateSchema,
  keycapUpdateSchema,
  validateBody,
  validateQuery,
} from '../schemas'
import { deleteAssetsIfUnreferenced, syncContentImages } from '../services/media.service'
import {
  KEYCAP_DETAIL_INCLUDE,
  KEYCAP_LIST_INCLUDE,
  toKeycapDetail,
  toKeycapListItem,
} from '../utils/responseTransformers'
import { readParam } from '../utils/routeParams'

const router = Router()

async function findNextSeq(): Promise<number> {
  const result = await prisma.keycap.aggregate({ _max: { seq: true } })
  return (result._max.seq ?? 0) + 1
}

function isUniqueSeqConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

router.get(
  '/',
  requireAdmin,
  validateQuery(adminKeycapListQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, pageSize, q } = req.query as unknown as {
      page: number
      pageSize: number
      q?: string
    }

    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { description: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const [keycaps, total, nextSeq] = await Promise.all([
      prisma.keycap.findMany({
        where,
        orderBy: { seq: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: KEYCAP_LIST_INCLUDE,
      }),
      prisma.keycap.count({ where }),
      findNextSeq(),
    ])

    res.json({
      items: keycaps.map((keycap) => toKeycapListItem(keycap)),
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
    const keycap = await prisma.keycap.findUnique({
      where: { id: readParam(req.params.id) },
      include: KEYCAP_DETAIL_INCLUDE,
    })
    if (!keycap) {
      res.status(404).json({ error: '键帽不存在' })
      return
    }
    res.json({ keycap: toKeycapDetail(keycap) })
  })
)

router.post(
  '/',
  requireAdmin,
  validateBody(keycapCreateSchema),
  asyncHandler(async (req, res) => {
    const { seq, name, description, assetIds } = req.body as {
      seq?: number
      name: string
      description?: string
      assetIds: string[]
    }

    const nextSeq = seq ?? (await findNextSeq())

    try {
      const keycapId = await prisma.$transaction(async (tx) => {
        const keycap = await tx.keycap.create({
          data: { seq: nextSeq, name, description: description ?? '' },
          select: { id: true },
        })
        await syncContentImages(tx, { type: 'keycap', id: keycap.id }, assetIds)
        return keycap.id
      })

      const keycap = await prisma.keycap.findUniqueOrThrow({
        where: { id: keycapId },
        include: KEYCAP_DETAIL_INCLUDE,
      })
      res.status(201).json({ keycap: toKeycapDetail(keycap) })
    } catch (error) {
      if (isUniqueSeqConflict(error)) {
        res.status(409).json({ error: '该序号已被占用' })
        return
      }
      throw error
    }
  })
)

router.patch(
  '/:id',
  requireAdmin,
  validateBody(keycapUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = readParam(req.params.id)
    const { seq, name, description, assetIds } = req.body as {
      seq?: number
      name?: string
      description?: string
      assetIds?: string[]
    }

    const existing = await prisma.keycap.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      res.status(404).json({ error: '键帽不存在' })
      return
    }

    try {
      const removedAssetIds = await prisma.$transaction(async (tx) => {
        await tx.keycap.update({
          where: { id },
          data: {
            ...(seq === undefined ? {} : { seq }),
            ...(name === undefined ? {} : { name }),
            ...(description === undefined ? {} : { description }),
          },
        })

        if (!assetIds) return []
        return syncContentImages(tx, { type: 'keycap', id }, assetIds)
      })

      await deleteAssetsIfUnreferenced(removedAssetIds)

      const keycap = await prisma.keycap.findUniqueOrThrow({
        where: { id },
        include: KEYCAP_DETAIL_INCLUDE,
      })
      res.json({ keycap: toKeycapDetail(keycap) })
    } catch (error) {
      if (isUniqueSeqConflict(error)) {
        res.status(409).json({ error: '该序号已被占用' })
        return
      }
      throw error
    }
  })
)

router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = readParam(req.params.id)
    const existing = await prisma.keycap.findUnique({
      where: { id },
      select: { id: true, images: { select: { assetId: true } } },
    })
    if (!existing) {
      res.status(404).json({ error: '键帽不存在' })
      return
    }

    await prisma.keycap.delete({ where: { id } })
    await deleteAssetsIfUnreferenced(existing.images.map((image) => image.assetId))

    res.json({ success: true })
  })
)

export function registerAdminKeycapRoutes(app: Router) {
  app.use('/api/admin/keycaps', router)
}
