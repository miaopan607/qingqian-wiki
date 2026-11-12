import { Prisma } from '@prisma/client'
import type {
  AdminCheckInParticipant,
  CheckInAuditLogItem,
  CheckInEvent,
  Paginated,
} from '../../types/entities'
import {
  getCheckInDayWindows,
  getCheckInWindow,
  getNextCheckInRefreshChange,
} from '../../lib/checkInSchedule'
import { prisma } from '../prisma'
import { AppError } from '../utils/appError'
import { getCheckInNow } from './checkInClock.service'
import {
  getAdminCheckInParticipant,
  getCheckInScoreSeconds,
  lockCheckInProfile,
  toCheckInRecord,
  toRefreshChange,
} from './checkIn.service'

type AuditIdentity = { actorUid: string; actorName: string; targetUid: string; targetName: string }
async function identities(
  tx: Prisma.TransactionClient,
  actorUid: string,
  userUid: string
): Promise<AuditIdentity> {
  const [actor, target] = await Promise.all([
    tx.user.findUnique({ where: { uid: actorUid }, select: { uid: true, displayName: true } }),
    tx.user.findUnique({ where: { uid: userUid }, select: { uid: true, displayName: true } }),
  ])
  if (!actor || !target) throw new AppError('用户不存在', 404, 'USER_NOT_FOUND')
  return {
    actorUid: actor.uid,
    actorName: actor.displayName,
    targetUid: target.uid,
    targetName: target.displayName,
  }
}
async function audit(
  tx: Prisma.TransactionClient,
  event: CheckInEvent,
  identity: AuditIdentity,
  action: CheckInAuditLogItem['action'],
  reason: string | undefined,
  before: Prisma.InputJsonObject,
  after: Prisma.InputJsonObject
) {
  await tx.checkInAuditLog.create({
    data: { eventId: event.id, ...identity, action, reason: reason?.trim() || null, before, after },
  })
}

export async function setAdminCheckInRecord(
  event: CheckInEvent,
  actorUid: string,
  userUid: string,
  dayIndex: number,
  checkedInAt: string,
  reason?: string
): Promise<AdminCheckInParticipant> {
  return prisma.$transaction(async (tx) => {
    const identity = await identities(tx, actorUid, userUid)
    const profile = await lockCheckInProfile(tx, event, userUid)
    const minute = event.fixedRefreshMinute ?? profile.refreshMinute
    if (minute === null)
      throw new AppError('请先设定每日刷新时间', 409, 'CHECK_IN_REFRESH_REQUIRED')
    const windows = getCheckInDayWindows(event, minute, profile.refreshChanges.map(toRefreshChange))
    const window = windows[dayIndex]
    const time = new Date(Math.floor(Date.parse(checkedInAt) / 1000) * 1000)
    const now = getCheckInNow()
    if (
      !window ||
      time.getTime() < Date.parse(window.startsAt) ||
      time.getTime() >= Date.parse(window.endsAt) ||
      time > now
    )
      throw new AppError(
        '签到时间必须位于目标签到日内且不能晚于活动时钟',
        400,
        'CHECK_IN_INVALID_TIME'
      )
    const key = { eventId: event.id, userUid, dayIndex }
    const before = await tx.checkIn.findUnique({ where: { eventId_userUid_dayIndex: key } })
    const scoreSeconds = getCheckInScoreSeconds(time, new Date(window.startsAt), event.scoreMode)
    if (
      !before ||
      before.checkedInAt.getTime() !== time.getTime() ||
      before.scoreSeconds !== scoreSeconds
    ) {
      const record = await tx.checkIn.upsert({
        where: { eventId_userUid_dayIndex: key },
        create: { ...key, checkedInAt: time, scoreSeconds },
        update: { checkedInAt: time, scoreSeconds },
      })
      await audit(
        tx,
        event,
        identity,
        'record_set',
        reason,
        { record: before ? toCheckInRecord(before) : null },
        { record: toCheckInRecord(record) }
      )
    }
    return getAdminCheckInParticipant(userUid, event, now, tx)
  })
}

export async function deleteAdminCheckInRecord(
  event: CheckInEvent,
  actorUid: string,
  userUid: string,
  dayIndex: number,
  reason?: string
): Promise<AdminCheckInParticipant> {
  return prisma.$transaction(async (tx) => {
    const identity = await identities(tx, actorUid, userUid)
    await lockCheckInProfile(tx, event, userUid)
    const key = { eventId: event.id, userUid, dayIndex }
    const before = await tx.checkIn.findUnique({ where: { eventId_userUid_dayIndex: key } })
    if (!before) throw new AppError('该日签到不存在', 404, 'CHECK_IN_RECORD_NOT_FOUND')
    await tx.checkIn.delete({ where: { eventId_userUid_dayIndex: key } })
    await audit(
      tx,
      event,
      identity,
      'record_delete',
      reason,
      { record: toCheckInRecord(before) },
      { record: null }
    )
    return getAdminCheckInParticipant(userUid, event, getCheckInNow(), tx)
  })
}

export async function updateAdminCheckInProfile(
  event: CheckInEvent,
  actorUid: string,
  userUid: string,
  input: { wechat?: string | null; refreshMinute?: number; reason?: string }
): Promise<AdminCheckInParticipant> {
  return prisma.$transaction(async (tx) => {
    const identity = await identities(tx, actorUid, userUid)
    const profile = await lockCheckInProfile(tx, event, userUid)
    const now = getCheckInNow()
    const before = {
      wechat: profile.wechat,
      initialRefreshMinute: profile.refreshMinute,
      refreshChanges: profile.refreshChanges.map(toRefreshChange),
    }
    const data: Prisma.CheckInProfileUpdateInput = {}
    if (input.wechat !== undefined && input.wechat !== profile.wechat) data.wechat = input.wechat
    if (input.refreshMinute !== undefined) {
      if (event.fixedRefreshMinute !== null)
        throw new AppError('没有可修改的未来刷新边界', 409, 'CHECK_IN_NO_FUTURE_REFRESH')
      if (profile.refreshMinute === null) {
        if (
          getCheckInWindow(now, getCheckInDayWindows(event, input.refreshMinute, [])).phase ===
          'ended'
        )
          throw new AppError('没有可修改的未来刷新边界', 409, 'CHECK_IN_NO_FUTURE_REFRESH')
        data.refreshMinute = input.refreshMinute
      } else {
        const changes = before.refreshChanges
        const next = getNextCheckInRefreshChange(
          event,
          profile.refreshMinute,
          changes,
          now,
          input.refreshMinute
        )
        if (!next) throw new AppError('没有可修改的未来刷新边界', 409, 'CHECK_IN_NO_FUTURE_REFRESH')
        const lastMinute = changes.at(-1)?.refreshMinute ?? profile.refreshMinute
        if (lastMinute !== input.refreshMinute)
          await tx.checkInRefreshChange.create({
            data: {
              eventId: event.id,
              userUid,
              fromDayIndex: next.fromDayIndex,
              refreshMinute: input.refreshMinute,
            },
          })
      }
    }
    if (Object.keys(data).length)
      await tx.checkInProfile.update({ where: { id: profile.id }, data })
    const afterProfile = await tx.checkInProfile.findUniqueOrThrow({
      where: { id: profile.id },
      include: { refreshChanges: { orderBy: { id: 'asc' } } },
    })
    const after = {
      wechat: afterProfile.wechat,
      initialRefreshMinute: afterProfile.refreshMinute,
      refreshChanges: afterProfile.refreshChanges.map(toRefreshChange),
    }
    if (
      before.wechat !== after.wechat ||
      before.initialRefreshMinute !== after.initialRefreshMinute ||
      before.refreshChanges.length !== after.refreshChanges.length
    )
      await audit(tx, event, identity, 'profile_update', input.reason, before, after)
    return getAdminCheckInParticipant(userUid, event, now, tx)
  })
}

export async function getCheckInAuditLogs(
  event: CheckInEvent,
  query: { userUid?: string; page: number; pageSize: number }
): Promise<Paginated<CheckInAuditLogItem>> {
  return prisma.$transaction(
    async (tx) => {
      const where = { eventId: event.id, ...(query.userUid ? { targetUid: query.userUid } : {}) }
      const [total, logs] = await Promise.all([
        tx.checkInAuditLog.count({ where }),
        tx.checkInAuditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ])
      return {
        items: logs.map((item) => ({
          ...item,
          action: item.action as CheckInAuditLogItem['action'],
          createdAt: item.createdAt.toISOString(),
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  )
}
