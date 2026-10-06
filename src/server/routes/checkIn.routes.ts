import { Prisma } from '@prisma/client'
import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler'
import { requireActiveUser } from '../middleware/auth'
import { writeLimiter } from '../middleware/rateLimit'
import { prisma } from '../prisma'
import { checkInBodySchema, publicListQuerySchema, validateBody, validateQuery } from '../schemas'
import {
  CHECK_IN_EVENT,
  CHECK_IN_EVENT_ID,
  getCheckInWindow,
  getCheckInScoreSeconds,
  getCheckInProgress,
  getCheckInRankings,
  toCheckInRecord,
} from '../services/checkIn.service'
import { getTurnstileSiteKey, verifyCheckInTurnstile } from '../services/turnstile.service'
import { getCheckInNow } from '../services/checkInClock.service'
import type { AuthenticatedRequest } from '../types'
import type { SubmitCheckInInput } from '../../types/api'
import { AppError } from '../utils/appError'

const router = Router()

function requireCurrentDay(now: Date, dayIndex: number) {
  const window = getCheckInWindow(now)
  if (window.phase === 'upcoming')
    throw new AppError('签到活动尚未开始', 409, 'CHECK_IN_NOT_STARTED')
  if (window.phase === 'ended') throw new AppError('签到活动已结束', 409, 'CHECK_IN_ENDED')
  if (window.dayIndex !== dayIndex)
    throw new AppError('签到日已刷新，请重新验证', 409, 'CHECK_IN_DAY_CHANGED')
  return window
}

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const now = getCheckInNow()
    const window = getCheckInWindow(now)
    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      event: CHECK_IN_EVENT,
      serverNow: now.toISOString(),
      phase: window.phase,
      dayIndex: window.dayIndex,
      nextTransitionAt: window.nextTransitionAt?.toISOString() ?? null,
      turnstileSiteKey: getTurnstileSiteKey(),
      me: req.authUser ? await getCheckInProgress(req.authUser.uid) : null,
    })
  })
)

router.post(
  '/',
  validateBody(checkInBodySchema),
  requireActiveUser,
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { turnstileToken, dayIndex } = req.body as SubmitCheckInInput
    const userUid = req.authUser!.uid
    requireCurrentDay(getCheckInNow(), dayIndex)
    const key = { eventId: CHECK_IN_EVENT_ID, userUid, dayIndex }
    const alreadyDone = () => new AppError('今日已签到', 409, 'CHECK_IN_ALREADY_DONE')
    if (await prisma.checkIn.findUnique({ where: { eventId_userUid_dayIndex: key } }))
      throw alreadyDone()
    await verifyCheckInTurnstile(turnstileToken, req.ip)
    const checkedInAt = new Date(Math.floor(getCheckInNow().getTime() / 1000) * 1000)
    const window = requireCurrentDay(checkedInAt, dayIndex)
    try {
      const record = await prisma.checkIn.create({
        data: {
          ...key,
          checkedInAt,
          scoreSeconds: getCheckInScoreSeconds(checkedInAt, window.dayStartsAt!),
        },
      })
      res.status(201).json({ record: toCheckInRecord(record) })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw alreadyDone()
      throw error
    }
  })
)

router.get(
  '/rankings',
  validateQuery(publicListQuerySchema),
  asyncHandler(async (req, res) => {
    if (getCheckInWindow(getCheckInNow()).phase !== 'ended') {
      throw new AppError('活动结束后公示排名', 403, 'CHECK_IN_RANKINGS_HIDDEN')
    }
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number }
    res.setHeader('Cache-Control', 'no-store')
    res.json(await getCheckInRankings(page, pageSize))
  })
)

export function registerCheckInRoutes(app: Router) {
  app.use('/api/check-in', router)
}
