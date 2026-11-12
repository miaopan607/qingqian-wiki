import { Router } from 'express'
import { asyncHandler } from '../middleware/asyncHandler'
import { requireActiveUser } from '../middleware/auth'
import { writeLimiter } from '../middleware/rateLimit'
import { prisma } from '../prisma'
import {
  checkInBodySchema,
  checkInEventQuerySchema,
  checkInRankingQuerySchema,
  checkInRefreshSchema,
  updateCheckInProfileSchema,
  validateBody,
  validateQuery,
} from '../schemas'
import {
  getCheckInScoreSeconds,
  getCheckInProgress,
  getCheckInRankings,
  toCheckInRecord,
  setCheckInWechat,
  lockCheckInProfile,
  buildCheckInProgress,
} from '../services/checkIn.service'
import {
  getCheckInDayWindows,
  getCheckInWindow,
  getGlobalCheckInWindow,
} from '../../lib/checkInSchedule'
import { getCheckInEvent, getCheckInEvents } from '../services/checkInEvents'
import { getTurnstileSiteKey, verifyCheckInTurnstile } from '../services/turnstile.service'
import { getCheckInNow } from '../services/checkInClock.service'
import type { AuthenticatedRequest } from '../types'
import type { CheckInEvent, CheckInWindow } from '../../types/entities'
import { AppError } from '../utils/appError'

const router = Router()
function requireWritable(event: CheckInEvent) {
  if (event.archived) throw new AppError('该活动已归档', 409, 'CHECK_IN_ARCHIVED')
}
function requireCurrentDay(window: CheckInWindow, dayIndex: number, configured: boolean) {
  if (!configured) throw new AppError('请先设定每日刷新时间', 409, 'CHECK_IN_REFRESH_REQUIRED')
  if (window.phase === 'upcoming')
    throw new AppError('签到活动尚未开始', 409, 'CHECK_IN_NOT_STARTED')
  if (window.phase === 'ended') throw new AppError('签到活动已结束', 409, 'CHECK_IN_ENDED')
  if (window.dayIndex !== dayIndex)
    throw new AppError('签到日已刷新，请重新验证', 409, 'CHECK_IN_DAY_CHANGED')
  return window
}
async function status(userUid: string | undefined, event: CheckInEvent) {
  const now = getCheckInNow()
  const me = userUid ? await getCheckInProgress(userUid, event, now) : null
  const window = me ?? getGlobalCheckInWindow(event, now)
  return {
    event,
    events: getCheckInEvents(),
    serverNow: now.toISOString(),
    phase: window.phase,
    dayIndex: window.dayIndex,
    nextTransitionAt: window.nextTransitionAt,
    turnstileSiteKey: getTurnstileSiteKey(),
    me,
  }
}
router.get(
  '/',
  validateQuery(checkInEventQuerySchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.setHeader('Cache-Control', 'private, no-store')
    res.json(
      await status(req.authUser?.uid, getCheckInEvent(req.query.eventId as string | undefined))
    )
  })
)
router.put(
  '/wechat',
  validateQuery(checkInEventQuerySchema),
  validateBody(updateCheckInProfileSchema),
  requireActiveUser,
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const event = getCheckInEvent(req.query.eventId as string | undefined)
    requireWritable(event)
    res.json({ wechat: await setCheckInWechat(req.authUser!.uid, req.body.wechat, event) })
  })
)
router.put(
  '/refresh-time',
  validateQuery(checkInEventQuerySchema),
  validateBody(checkInRefreshSchema),
  requireActiveUser,
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const event = getCheckInEvent(req.query.eventId as string | undefined)
    requireWritable(event)
    const userUid = req.authUser!.uid
    const { refreshMinute } = req.body as { refreshMinute: number }
    await prisma.$transaction(async (tx) => {
      const profile = await lockCheckInProfile(tx, event, userUid)
      if (profile.refreshMinute !== null)
        throw new AppError('刷新时间已锁定，不能自行修改', 409, 'CHECK_IN_REFRESH_LOCKED')
      if (
        getCheckInWindow(getCheckInNow(), getCheckInDayWindows(event, refreshMinute, [])).phase ===
        'ended'
      )
        throw new AppError('个人签到活动已结束', 409, 'CHECK_IN_ENDED')
      await tx.checkInProfile.update({ where: { id: profile.id }, data: { refreshMinute } })
    })
    res.setHeader('Cache-Control', 'private, no-store')
    res.json(await status(userUid, event))
  })
)
router.post(
  '/',
  validateQuery(checkInEventQuerySchema),
  validateBody(checkInBodySchema),
  requireActiveUser,
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const event = getCheckInEvent(req.query.eventId as string | undefined)
    requireWritable(event)
    const { turnstileToken, dayIndex } = req.body as { turnstileToken: string; dayIndex: number }
    const userUid = req.authUser!.uid
    const progress = await getCheckInProgress(userUid, event, getCheckInNow())
    requireCurrentDay(progress, dayIndex, progress.dayWindows.length > 0)
    const alreadyDone = () => new AppError('今日已签到', 409, 'CHECK_IN_ALREADY_DONE')
    if (progress.records.some((record) => record.dayIndex === dayIndex)) throw alreadyDone()
    await verifyCheckInTurnstile(turnstileToken, req.ip)
    const record = await prisma.$transaction(async (tx) => {
      const profile = await lockCheckInProfile(tx, event, userUid)
      const checkedInAt = new Date(Math.floor(getCheckInNow().getTime() / 1000) * 1000)
      const key = { eventId: event.id, userUid, dayIndex }
      const records = await tx.checkIn.findMany({ where: { eventId: event.id, userUid } })
      const current = buildCheckInProgress(event, checkedInAt, records, profile)
      const window = requireCurrentDay(current, dayIndex, current.dayWindows.length > 0)
      if (records.some((item) => item.dayIndex === dayIndex)) throw alreadyDone()
      return tx.checkIn.create({
        data: {
          ...key,
          checkedInAt,
          scoreSeconds: getCheckInScoreSeconds(
            checkedInAt,
            new Date(window.dayStartsAt!),
            event.scoreMode
          ),
        },
      })
    })
    res.status(201).json({ record: toCheckInRecord(record) })
  })
)
router.get(
  '/rankings',
  validateQuery(checkInRankingQuerySchema),
  asyncHandler(async (req, res) => {
    const event = getCheckInEvent(req.query.eventId as string | undefined)
    if (getCheckInNow().getTime() < Date.parse(event.rankingsAvailableAt))
      throw new AppError('活动结束后公示排名', 403, 'CHECK_IN_RANKINGS_HIDDEN')
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number }
    res.setHeader('Cache-Control', 'no-store')
    res.json(await getCheckInRankings(page, pageSize, event))
  })
)
export function registerCheckInRoutes(app: Router) {
  app.use('/api/check-in', router)
}
