import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { prisma } from '../prisma'
import { keycapListQuerySchema, validateQuery } from '../schemas'
import {
  KEYCAP_DETAIL_INCLUDE,
  KEYCAP_LIST_INCLUDE,
  toKeycapDetail,
  toKeycapListItem,
} from '../utils/responseTransformers'
import { readParam } from '../utils/routeParams'

const router = Router()

router.get(
  '/',
  validateQuery(keycapListQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number }

    const [keycaps, total] = await Promise.all([
      prisma.keycap.findMany({
        orderBy: { seq: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: KEYCAP_LIST_INCLUDE,
      }),
      prisma.keycap.count(),
    ])

    res.json({
      items: keycaps.map((keycap) => toKeycapListItem(keycap)),
      total,
      page,
      pageSize,
    })
  })
)

router.get(
  '/:id',
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

export function registerKeycapsRoutes(app: Router) {
  app.use('/api/keycaps', router)
}
