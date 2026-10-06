import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler'
import { requireAdmin } from '../middleware/auth'
import { adminCheckInQuerySchema, validateQuery } from '../schemas'
import { getAdminCheckInSnapshot } from '../services/checkIn.service'
import { getCheckInNow } from '../services/checkInClock.service'
import type { AdminCheckInParticipant } from '../../types/entities'

const router = Router()
router.use(requireAdmin)
router.get(
  '/',
  validateQuery(adminCheckInQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      page: number
      pageSize: number
      q?: string
      state?: AdminCheckInParticipant['state']
    }
    const snapshotAt = getCheckInNow()
    res.setHeader('Cache-Control', 'private, no-store')
    res.json(await getAdminCheckInSnapshot(snapshotAt, query))
  })
)

export function registerAdminCheckInRoutes(app: Router) {
  app.use('/api/admin/check-in', router)
}
