import {
  Prisma,
  type CheckIn,
  type CheckInProfile,
  type CheckInRefreshChange as DbRefreshChange,
} from '@prisma/client'
import type { AdminCheckInResponse, CheckInRankingResponse } from '../../types/api'
import type {
  AdminCheckInParticipant,
  CheckInEvent,
  CheckInProgress,
  CheckInRecord,
  CheckInRefreshChange,
} from '../../types/entities'
import {
  getCheckInDayWindows,
  getCheckInWindow,
  getGlobalCheckInWindow,
} from '../../lib/checkInSchedule'
import { prisma } from '../prisma'
import { AppError } from '../utils/appError'

export function getCheckInScoreSeconds(
  now: Date,
  dayStartsAt: Date,
  scoreMode: CheckInEvent['scoreMode']
): number {
  return (
    Math.floor((now.getTime() - dayStartsAt.getTime()) / 1000) +
    (scoreMode === 'extended_clock' ? 18000 : 0)
  )
}
export function toCheckInRecord(record: CheckIn): CheckInRecord {
  return {
    dayIndex: record.dayIndex,
    checkedInAt: record.checkedInAt.toISOString(),
    scoreSeconds: record.scoreSeconds,
  }
}
export function toRefreshChange(change: DbRefreshChange): CheckInRefreshChange {
  return {
    id: change.id,
    fromDayIndex: change.fromDayIndex,
    refreshMinute: change.refreshMinute,
    createdAt: change.createdAt.toISOString(),
  }
}
export type ProfileWithChanges = CheckInProfile & { refreshChanges: DbRefreshChange[] }

export function buildCheckInProgress(
  event: CheckInEvent,
  now: Date,
  records: CheckIn[],
  profile: ProfileWithChanges | null
): CheckInProgress {
  const initialRefreshMinute = profile?.refreshMinute ?? null
  const refreshChanges = profile?.refreshChanges.map(toRefreshChange) ?? []
  const minute = event.fixedRefreshMinute ?? initialRefreshMinute
  const dayWindows = minute === null ? [] : getCheckInDayWindows(event, minute, refreshChanges)
  const window = dayWindows.length
    ? getCheckInWindow(now, dayWindows)
    : getGlobalCheckInWindow(event, now)
  const signed = new Set(records.map((record) => record.dayIndex))
  const missedDayIndexes = dayWindows
    .filter((day) => Date.parse(day.endsAt) <= now.getTime() && !signed.has(day.dayIndex))
    .map((day) => day.dayIndex)
  let effectiveChange: CheckInRefreshChange | undefined
  for (const change of refreshChanges) {
    const at =
      change.fromDayIndex === event.days
        ? dayWindows.at(-1)?.endsAt
        : dayWindows[change.fromDayIndex]?.startsAt
    if (
      at !== undefined &&
      Date.parse(at) <= now.getTime() &&
      (!effectiveChange || change.id > effectiveChange.id)
    )
      effectiveChange = change
  }
  return {
    ...window,
    records: records.map(toCheckInRecord),
    completedDays: records.length,
    averageTimeSeconds: records.length
      ? records.reduce((sum, item) => sum + item.scoreSeconds, 0) / records.length
      : null,
    eligible: records.length === event.days,
    wechat: profile?.wechat ?? null,
    initialRefreshMinute,
    refreshMinute:
      event.fixedRefreshMinute ?? effectiveChange?.refreshMinute ?? initialRefreshMinute,
    refreshChanges,
    dayWindows,
    missedDayIndexes,
  }
}

export async function getCheckInProgress(
  userUid: string,
  event: CheckInEvent,
  now: Date
): Promise<CheckInProgress> {
  return prisma.$transaction(
    async (tx) => {
      const [records, profile] = await Promise.all([
        tx.checkIn.findMany({
          where: { eventId: event.id, userUid, checkedInAt: { lte: now } },
          orderBy: { dayIndex: 'asc' },
        }),
        tx.checkInProfile.findUnique({
          where: { eventId_userUid: { eventId: event.id, userUid } },
          include: { refreshChanges: { orderBy: { id: 'asc' } } },
        }),
      ])
      return buildCheckInProgress(event, now, records, profile)
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  )
}

// 所有写入共用档案行锁；锁后重读，保证配置、签到和审计前值一致。
export async function lockCheckInProfile(
  tx: Prisma.TransactionClient,
  event: CheckInEvent,
  userUid: string
): Promise<ProfileWithChanges> {
  const key = { eventId: event.id, userUid }
  await tx.checkInProfile.upsert({
    where: { eventId_userUid: key },
    create: key,
    update: { userUid },
  })
  await tx.$queryRaw`SELECT "id" FROM "CheckInProfile" WHERE "eventId" = ${event.id} AND "userUid" = ${userUid} FOR UPDATE`
  return tx.checkInProfile.findUniqueOrThrow({
    where: { eventId_userUid: key },
    include: { refreshChanges: { orderBy: { id: 'asc' } } },
  })
}

export async function setCheckInWechat(
  userUid: string,
  wechat: string | null,
  event: CheckInEvent
): Promise<string | null> {
  return prisma.$transaction(async (tx) => {
    await lockCheckInProfile(tx, event, userUid)
    return (
      await tx.checkInProfile.update({
        where: { eventId_userUid: { eventId: event.id, userUid } },
        data: { wechat },
      })
    ).wechat
  })
}

function rankParticipants(
  participants: { userUid: string; completedDays: number; totalScore: number }[],
  event: CheckInEvent
): Map<string, number> {
  const qualified = participants
    .filter((item) => item.completedDays === event.days)
    .sort((a, b) => a.totalScore - b.totalScore || a.userUid.localeCompare(b.userUid))
  const ranks = new Map<string, number>()
  let rank = 0,
    previousScore = -1
  qualified.forEach((item, index) => {
    if (item.totalScore !== previousScore) rank = index + 1
    ranks.set(item.userUid, rank)
    previousScore = item.totalScore
  })
  return ranks
}

export async function loadAdminCheckInParticipants(
  tx: Prisma.TransactionClient,
  event: CheckInEvent,
  now: Date,
  extraUid?: string
): Promise<AdminCheckInParticipant[]> {
  const users = await tx.user.findMany({
    where: {
      OR: [
        { checkIns: { some: { eventId: event.id, checkedInAt: { lte: now } } } },
        ...(event.fixedRefreshMinute === null
          ? [{ checkInProfiles: { some: { eventId: event.id, refreshMinute: { not: null } } } }]
          : []),
        ...(extraUid ? [{ uid: extraUid }] : []),
      ],
    },
    select: {
      uid: true,
      displayName: true,
      status: true,
      checkIns: {
        where: { eventId: event.id, checkedInAt: { lte: now } },
        orderBy: { dayIndex: 'asc' },
      },
      checkInProfiles: {
        where: { eventId: event.id },
        include: { refreshChanges: { orderBy: { id: 'asc' } } },
      },
    },
  })
  const ranks =
    now.getTime() >= Date.parse(event.rankingsAvailableAt)
      ? rankParticipants(
          users.map((user) => ({
            userUid: user.uid,
            completedDays: user.checkIns.length,
            totalScore: user.checkIns.reduce((sum, record) => sum + record.scoreSeconds, 0),
          })),
          event
        )
      : new Map<string, number>()
  return users.map((user) => {
    const progress = buildCheckInProgress(
      event,
      now,
      user.checkIns,
      user.checkInProfiles[0] ?? null
    )
    return {
      ...progress,
      userUid: user.uid,
      displayName: user.displayName,
      userStatus: user.status,
      state: progress.eligible
        ? 'completed'
        : progress.missedDayIndexes.length
          ? 'missed'
          : 'in_progress',
      rank: ranks.get(user.uid) ?? null,
      winner: event.rewardMode === 'possible' ? null : ranks.get(user.uid) === 1,
    }
  })
}

export async function getAdminCheckInParticipant(
  userUid: string,
  event: CheckInEvent,
  now: Date,
  tx?: Prisma.TransactionClient
): Promise<AdminCheckInParticipant> {
  const load = async (client: Prisma.TransactionClient) => {
    const participant = (await loadAdminCheckInParticipants(client, event, now, userUid)).find(
      (item) => item.userUid === userUid
    )
    if (!participant) throw new AppError('用户不存在', 404, 'USER_NOT_FOUND')
    return participant
  }
  return tx
    ? load(tx)
    : prisma.$transaction(load, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
}

export async function getCheckInRankings(
  page: number,
  pageSize: number,
  event: CheckInEvent
): Promise<CheckInRankingResponse> {
  return prisma.$transaction(
    async (tx) => {
      const groups = await tx.checkIn.groupBy({
        by: ['userUid'],
        where: { eventId: event.id },
        _count: { _all: true },
        _sum: { scoreSeconds: true },
      })
      const participants = groups.map((group) => ({
        userUid: group.userUid,
        completedDays: group._count._all,
        totalScore: group._sum.scoreSeconds ?? 0,
      }))
      const ranks = rankParticipants(participants, event)
      participants.sort(
        (a, b) =>
          (ranks.get(a.userUid) ?? Infinity) - (ranks.get(b.userUid) ?? Infinity) ||
          b.completedDays - a.completedDays ||
          a.userUid.localeCompare(b.userUid)
      )
      const selected = participants.slice((page - 1) * pageSize, page * pageSize)
      const users = await tx.user.findMany({
        where: { uid: { in: selected.map((item) => item.userUid) } },
        select: { uid: true, displayName: true },
      })
      const names = new Map(users.map((user) => [user.uid, user.displayName]))
      return {
        items: selected.map((item) => ({
          userUid: item.userUid,
          displayName: names.get(item.userUid)!,
          completedDays: item.completedDays,
          averageTimeSeconds: ranks.has(item.userUid) ? item.totalScore / event.days : null,
          rank: ranks.get(item.userUid) ?? null,
          winner: event.rewardMode === 'possible' ? null : ranks.get(item.userUid) === 1,
        })),
        total: participants.length,
        qualifiedTotal: ranks.size,
        page,
        pageSize,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  )
}

export async function getAdminCheckInSnapshot(
  snapshotAt: Date,
  query: { page: number; pageSize: number; q?: string; state?: AdminCheckInParticipant['state'] },
  event: CheckInEvent
): Promise<AdminCheckInResponse> {
  return prisma.$transaction(
    async (tx) => {
      const participants = await loadAdminCheckInParticipants(tx, event, snapshotAt)
      const global = getGlobalCheckInWindow(event, snapshotAt)
      const filtered = participants.filter(
        (item) =>
          (!query.state || item.state === query.state) &&
          (!query.q ||
            item.userUid === query.q ||
            item.displayName.toLocaleLowerCase().includes(query.q.toLocaleLowerCase()))
      )
      filtered.sort(
        (a, b) =>
          (a.rank ?? Infinity) - (b.rank ?? Infinity) ||
          b.completedDays - a.completedDays ||
          (a.averageTimeSeconds ?? Infinity) - (b.averageTimeSeconds ?? Infinity) ||
          a.userUid.localeCompare(b.userUid)
      )
      const fixed = getCheckInDayWindows(event, event.fixedRefreshMinute ?? 0, [])
      return {
        event,
        snapshotAt: snapshotAt.toISOString(),
        phase: global.phase,
        summary: {
          participants: participants.length,
          totalCheckIns: participants.reduce((sum, item) => sum + item.completedDays, 0),
          completedParticipants: participants.filter((item) => item.state === 'completed').length,
          missedParticipants: participants.filter((item) => item.state === 'missed').length,
          inProgressParticipants: participants.filter((item) => item.state === 'in_progress')
            .length,
          todayCheckIns:
            global.phase !== 'active'
              ? null
              : participants.filter(
                  (item) =>
                    item.dayIndex !== null &&
                    item.records.some((record) => record.dayIndex === item.dayIndex)
                ).length,
        },
        daily: fixed.map((day) => {
          const startsAt = Date.parse(day.startsAt)
          const endsAt =
            Date.parse(day.endsAt) + (event.fixedRefreshMinute === null ? 1439 * 60000 : 0)
          return {
            dayIndex: day.dayIndex,
            checkIns: participants.filter((item) =>
              item.records.some((record) => record.dayIndex === day.dayIndex)
            ).length,
            phase:
              snapshotAt.getTime() < startsAt
                ? 'upcoming'
                : snapshotAt.getTime() >= endsAt
                  ? 'ended'
                  : 'active',
          }
        }),
        items: filtered.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  )
}
