import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler'
import { requireAdmin } from '../middleware/auth'
import { writeLimiter } from '../middleware/rateLimit'
import {
  adminCheckInQuerySchema,
  checkInEventQuerySchema,
  checkInLogsQuerySchema,
  adminCheckInRecordSchema,
  adminCheckInDeleteSchema,
  adminCheckInProfileSchema,
  checkInDayIndexSchema,
  validateBody,
  validateQuery,
} from '../schemas'
import { getAdminCheckInSnapshot, getAdminCheckInParticipant } from '../services/checkIn.service'
import { getCheckInNow } from '../services/checkInClock.service'
import { getCheckInEvent } from '../services/checkInEvents'
import {
  setAdminCheckInRecord,
  deleteAdminCheckInRecord,
  updateAdminCheckInProfile,
  getCheckInAuditLogs,
} from '../services/checkInAdmin.service'
import type { AdminCheckInParticipant } from '../../types/entities'
import type { AuthenticatedRequest } from '../types'
import { readParam } from '../utils/routeParams'
import { AppError } from '../utils/appError'

const router = Router()
router.use(requireAdmin)
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store')
  next()
})
router.get(
  '/',
  validateQuery(adminCheckInQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      page: number
      pageSize: number
      q?: string
      state?: AdminCheckInParticipant['state']
      eventId?: string
    }
    res.json(await getAdminCheckInSnapshot(getCheckInNow(), query, getCheckInEvent(query.eventId)))
  })
)
router.get(
  '/logs',
  validateQuery(checkInLogsQuerySchema),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as {
      userUid?: string
      page: number
      pageSize: number
      eventId?: string
    }
    res.json(await getCheckInAuditLogs(getCheckInEvent(query.eventId), query))
  })
)
router.get(
  '/participants/:uid',
  validateQuery(checkInEventQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(
      await getAdminCheckInParticipant(
        readParam(req.params.uid),
        getCheckInEvent(req.query.eventId as string | undefined),
        getCheckInNow()
      )
    )
  })
)
function dayIndex(raw: string) {
  const result = checkInDayIndexSchema.safeParse(raw)
  if (!result.success) throw new AppError('签到日必须为0至29', 400, 'VALIDATION_ERROR')
  return result.data
}
router.put(
  '/participants/:uid/records/:dayIndex',
  validateQuery(checkInEventQuerySchema),
  validateBody(adminCheckInRecordSchema),
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json(
      await setAdminCheckInRecord(
        getCheckInEvent(req.query.eventId as string | undefined),
        req.authUser!.uid,
        readParam(req.params.uid),
        dayIndex(readParam(req.params.dayIndex)),
        req.body.checkedInAt,
        req.body.reason
      )
    )
  })
)
router.delete(
  '/participants/:uid/records/:dayIndex',
  validateQuery(checkInEventQuerySchema),
  validateBody(adminCheckInDeleteSchema),
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json(
      await deleteAdminCheckInRecord(
        getCheckInEvent(req.query.eventId as string | undefined),
        req.authUser!.uid,
        readParam(req.params.uid),
        dayIndex(readParam(req.params.dayIndex)),
        req.body.reason
      )
    )
  })
)
router.patch(
  '/participants/:uid/profile',
  validateQuery(checkInEventQuerySchema),
  validateBody(adminCheckInProfileSchema),
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json(
      await updateAdminCheckInProfile(
        getCheckInEvent(req.query.eventId as string | undefined),
        req.authUser!.uid,
        readParam(req.params.uid),
        req.body
      )
    )
  })
)
export function registerAdminCheckInRoutes(app: Router) {
  app.use('/api/admin/check-in', router)
}
