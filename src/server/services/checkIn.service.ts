import { Prisma, type CheckIn } from '@prisma/client'
import type { AdminCheckInResponse, CheckInRankingResponse } from '../../types/api'
import type { AdminCheckInParticipant, CheckInProgress, CheckInRecord } from '../../types/entities'
import { prisma } from '../prisma'
import { CHECK_IN_DEBUG } from './checkInClock.service'

export const CHECK_IN_EVENT_ID = CHECK_IN_DEBUG ? 'dev-2026-10-07' : '2026-10-07'
export const CHECK_IN_START = new Date('2026-10-06T21:00:00.000Z')
export const CHECK_IN_END = new Date('2026-11-05T21:00:00.000Z')
export const CHECK_IN_DAYS = 30
const DAY_MS = 86400000

export const CHECK_IN_EVENT = {
  id: CHECK_IN_EVENT_ID,
  debug: CHECK_IN_DEBUG,
  startsAt: CHECK_IN_START.toISOString(),
  endsAt: CHECK_IN_END.toISOString(),
  days: 30 as const,
  rewardLabel: '活动奖励',
}

export function getCheckInWindow(now: Date): {
  phase: 'upcoming' | 'active' | 'ended'
  dayIndex: number | null
  dayStartsAt: Date | null
  nextTransitionAt: Date | null
} {
  if (now < CHECK_IN_START) {
    return {
      phase: 'upcoming',
      dayIndex: null,
      dayStartsAt: null,
      nextTransitionAt: CHECK_IN_START,
    }
  }
  if (now >= CHECK_IN_END) {
    return { phase: 'ended', dayIndex: null, dayStartsAt: null, nextTransitionAt: null }
  }
  const dayIndex = Math.floor((now.getTime() - CHECK_IN_START.getTime()) / DAY_MS)
  const dayStartsAt = new Date(CHECK_IN_START.getTime() + dayIndex * DAY_MS)
  return {
    phase: 'active',
    dayIndex,
    dayStartsAt,
    nextTransitionAt: new Date(dayStartsAt.getTime() + DAY_MS),
  }
}

// 签到日从北京时间05:00起算，跨午夜继续累计到28:59:59。
export function getCheckInScoreSeconds(now: Date, dayStartsAt: Date): number {
  return 18000 + Math.floor((now.getTime() - dayStartsAt.getTime()) / 1000)
}

export function toCheckInRecord(record: CheckIn): CheckInRecord {
  return {
    dayIndex: record.dayIndex,
    checkedInAt: record.checkedInAt.toISOString(),
    scoreSeconds: record.scoreSeconds,
  }
}

export async function getCheckInProgress(userUid: string): Promise<CheckInProgress> {
  const [records, profile] = await Promise.all([
    prisma.checkIn.findMany({
      where: { eventId: CHECK_IN_EVENT_ID, userUid },
      orderBy: { dayIndex: 'asc' },
    }),
    prisma.checkInProfile.findUnique({
      where: { eventId_userUid: { eventId: CHECK_IN_EVENT_ID, userUid } },
      select: { wechat: true },
    }),
  ])
  return {
    records: records.map(toCheckInRecord),
    completedDays: records.length,
    averageTimeSeconds: records.length
      ? records.reduce((total, record) => total + record.scoreSeconds, 0) / records.length
      : null,
    eligible: records.length === CHECK_IN_DAYS,
    wechat: profile?.wechat ?? null,
  }
}

export async function setCheckInWechat(
  userUid: string,
  wechat: string | null
): Promise<string | null> {
  if (wechat === null) {
    await prisma.checkInProfile.deleteMany({
      where: { eventId: CHECK_IN_EVENT_ID, userUid },
    })
    return null
  }
  const updated = await prisma.checkInProfile.upsert({
    where: { eventId_userUid: { eventId: CHECK_IN_EVENT_ID, userUid } },
    create: { eventId: CHECK_IN_EVENT_ID, userUid, wechat },
    update: { wechat },
    select: { wechat: true },
  })
  return updated.wechat
}

function eventWhere(snapshotAt?: Date): Prisma.CheckInWhereInput {
  return {
    eventId: CHECK_IN_EVENT_ID,
    dayIndex: { gte: 0, lt: CHECK_IN_DAYS },
    ...(snapshotAt ? { checkedInAt: { lte: snapshotAt } } : {}),
  }
}

async function loadParticipants(tx: Prisma.TransactionClient, snapshotAt?: Date) {
  const groups = await tx.checkIn.groupBy({
    by: ['userUid'],
    where: eventWhere(snapshotAt),
    _count: { _all: true },
    _sum: { scoreSeconds: true },
  })
  return groups.map((group) => ({
    userUid: group.userUid,
    completedDays: group._count._all,
    totalScore: group._sum.scoreSeconds ?? 0,
  }))
}

type Participant = { userUid: string; completedDays: number; totalScore: number }

// 先按完整活动总分定名次，再做筛选/分页，保证并列跨页不改变排名。
function rankParticipants(participants: Participant[]): Map<string, number> {
  const qualified = participants
    .filter((item) => item.completedDays === CHECK_IN_DAYS)
    .sort((a, b) => a.totalScore - b.totalScore || a.userUid.localeCompare(b.userUid))
  const ranks = new Map<string, number>()
  let rank = 0
  let previousScore = -1
  qualified.forEach((item, index) => {
    if (item.totalScore !== previousScore) rank = index + 1
    ranks.set(item.userUid, rank)
    previousScore = item.totalScore
  })
  return ranks
}

export async function getCheckInRankings(
  page: number,
  pageSize: number
): Promise<CheckInRankingResponse> {
  const participants = await loadParticipants(prisma)
  const ranks = rankParticipants(participants)
  participants.sort((a, b) => {
    const ar = ranks.get(a.userUid),
      br = ranks.get(b.userUid)
    if (ar !== undefined || br !== undefined)
      return (ar ?? Infinity) - (br ?? Infinity) || a.userUid.localeCompare(b.userUid)
    return b.completedDays - a.completedDays || a.userUid.localeCompare(b.userUid)
  })
  const selected = participants.slice((page - 1) * pageSize, page * pageSize)
  const users = await prisma.user.findMany({
    where: { uid: { in: selected.map((item) => item.userUid) } },
    select: { uid: true, displayName: true },
  })
  const names = new Map(users.map((user) => [user.uid, user.displayName]))
  return {
    items: selected.map((item) => ({
      userUid: item.userUid,
      displayName: names.get(item.userUid)!,
      completedDays: item.completedDays,
      averageTimeSeconds: ranks.has(item.userUid) ? item.totalScore / CHECK_IN_DAYS : null,
      rank: ranks.get(item.userUid) ?? null,
      winner: ranks.get(item.userUid) === 1,
    })),
    total: participants.length,
    qualifiedTotal: ranks.size,
    page,
    pageSize,
  }
}

export async function getAdminCheckInSnapshot(
  snapshotAt: Date,
  query: { page: number; pageSize: number; q?: string; state?: AdminCheckInParticipant['state'] }
): Promise<AdminCheckInResponse> {
  return prisma.$transaction(
    async (tx) => {
      const window = getCheckInWindow(snapshotAt)
      const closedDays = window.phase === 'ended' ? CHECK_IN_DAYS : (window.dayIndex ?? 0)
      const where = eventWhere(snapshotAt)
      const signedDays = await tx.checkIn.findMany({
        where,
        select: { userUid: true, dayIndex: true, scoreSeconds: true },
      })
      const byUser = new Map<string, Participant & { days: Set<number> }>()
      const counts = Array<number>(CHECK_IN_DAYS).fill(0)
      for (const record of signedDays) {
        let participant = byUser.get(record.userUid)
        if (!participant) {
          participant = {
            userUid: record.userUid,
            completedDays: 0,
            totalScore: 0,
            days: new Set(),
          }
          byUser.set(record.userUid, participant)
        }
        participant.completedDays += 1
        participant.totalScore += record.scoreSeconds
        participant.days.add(record.dayIndex)
        counts[record.dayIndex] += 1
      }
      const participants = [...byUser.values()]
      const ranks =
        window.phase === 'ended' ? rankParticipants(participants) : new Map<string, number>()
      const stateCounts = { completed: 0, missed: 0, in_progress: 0 }
      const closedDayIndexes = Array.from({ length: closedDays }, (_, index) => index)
      const enriched = participants.map((item) => {
        const missedDayIndexes = closedDayIndexes.filter((index) => !item.days.has(index))
        const state: AdminCheckInParticipant['state'] =
          item.completedDays === CHECK_IN_DAYS
            ? 'completed'
            : missedDayIndexes.length
              ? 'missed'
              : 'in_progress'
        stateCounts[state] += 1
        return {
          ...item,
          missedDayIndexes,
          state,
          averageTimeSeconds: item.totalScore / item.completedDays,
        }
      })
      let filtered = enriched
      if (query.q) {
        const matches = await tx.user.findMany({
          where: {
            checkIns: { some: where },
            OR: [{ displayName: { contains: query.q, mode: 'insensitive' } }, { uid: query.q }],
          },
          select: { uid: true },
        })
        const ids = new Set(matches.map((user) => user.uid))
        filtered = filtered.filter((item) => ids.has(item.userUid))
      }
      if (query.state) filtered = filtered.filter((item) => item.state === query.state)
      filtered.sort((a, b) => {
        const ar = ranks.get(a.userUid),
          br = ranks.get(b.userUid)
        if (ar !== undefined || br !== undefined)
          return (ar ?? Infinity) - (br ?? Infinity) || a.userUid.localeCompare(b.userUid)
        return (
          b.completedDays - a.completedDays ||
          a.averageTimeSeconds - b.averageTimeSeconds ||
          a.userUid.localeCompare(b.userUid)
        )
      })
      const selected = filtered.slice(
        (query.page - 1) * query.pageSize,
        query.page * query.pageSize
      )
      const selectedIds = selected.map((item) => item.userUid)
      const users = await tx.user.findMany({
        where: { uid: { in: selectedIds } },
        select: {
          uid: true,
          displayName: true,
          status: true,
          checkIns: { where, orderBy: { dayIndex: 'asc' } },
          checkInProfiles: {
            where: { eventId: CHECK_IN_EVENT_ID },
            select: { wechat: true },
          },
        },
      })
      const userMap = new Map(users.map((user) => [user.uid, user]))
      return {
        event: CHECK_IN_EVENT,
        snapshotAt: snapshotAt.toISOString(),
        phase: window.phase,
        dayIndex: window.dayIndex,
        summary: {
          participants: participants.length,
          totalCheckIns: signedDays.length,
          completedParticipants: stateCounts.completed,
          missedParticipants: stateCounts.missed,
          inProgressParticipants: stateCounts.in_progress,
          todayCheckIns: window.dayIndex === null ? null : counts[window.dayIndex],
        },
        daily: Array.from({ length: CHECK_IN_DAYS }, (_, dayIndex) => ({
          dayIndex,
          checkIns: counts[dayIndex],
          closed: dayIndex < closedDays,
        })),
        items: selected.map((item) => ({
          userUid: item.userUid,
          displayName: userMap.get(item.userUid)!.displayName,
          wechat: userMap.get(item.userUid)!.checkInProfiles[0]?.wechat ?? null,
          userStatus: userMap.get(item.userUid)!.status,
          completedDays: item.completedDays,
          averageTimeSeconds: item.averageTimeSeconds,
          state: item.state,
          missedDayIndexes: item.missedDayIndexes,
          records: userMap.get(item.userUid)!.checkIns.map(toCheckInRecord),
          rank: ranks.get(item.userUid) ?? null,
          winner: ranks.get(item.userUid) === 1,
        })),
        total: filtered.length,
        page: query.page,
        pageSize: query.pageSize,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  )
}
