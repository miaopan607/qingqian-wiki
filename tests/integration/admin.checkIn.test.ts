import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAnonymousAgent,
  createTestUser,
  loginAgent,
  prisma,
  resetDatabase,
  seedSiteConfig,
} from './setup'
import { CHECK_IN_START, CHECK_IN_EVENT_ID } from '../../src/server/services/checkIn.service'

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})
afterEach(() => vi.useRealTimers())

async function adminSession(role: 'admin' | 'super_admin' | 'user' = 'admin') {
  const account = await createTestUser({ role })
  const session = await loginAgent(account.user.email, account.password)
  return { ...session, user: account.user }
}
async function record(userUid: string, dayIndex: number, scoreSeconds: number) {
  return prisma.checkIn.create({
    data: {
      eventId: CHECK_IN_EVENT_ID,
      userUid,
      dayIndex,
      scoreSeconds,
      checkedInAt: new Date(
        CHECK_IN_START.getTime() + dayIndex * 86400000 + (scoreSeconds - 18000) * 1000
      ),
    },
  })
}

describe('后台签到快照', () => {
  it('仅未封禁管理员可读，活动中不解锁公开榜单', async () => {
    const admin = await adminSession()
    const superAdmin = await adminSession('super_admin')
    const normal = await adminSession('user')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(CHECK_IN_START)
    expect((await createAnonymousAgent().get('/api/admin/check-in')).status).toBe(401)
    expect((await normal.agent.get('/api/admin/check-in')).status).toBe(403)
    expect((await admin.agent.get('/api/admin/check-in')).status).toBe(200)
    expect((await superAdmin.agent.get('/api/admin/check-in')).status).toBe(200)
    expect((await admin.agent.get('/api/check-in/rankings')).status).toBe(403)
    await prisma.user.update({ where: { uid: admin.user.uid }, data: { status: 'banned' } })
    expect((await admin.agent.get('/api/admin/check-in')).status).toBe(403)
  })
  it('汇总、漏签、凌晨明细按加载时快照计算且不受筛选影响', async () => {
    const admin = await adminSession()
    const a = await createTestUser({ displayName: '参与甲' })
    const b = await createTestUser({ displayName: '参与乙' })
    await record(a.user.uid, 0, 21600)
    await record(a.user.uid, 1, 90000)
    await record(a.user.uid, 2, 18000)
    await record(b.user.uid, 1, 25200)
    await record(b.user.uid, 3, 18000)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-08T22:00:00Z'))
    const response = await admin.agent.get('/api/admin/check-in')
    expect(response.body.summary).toEqual({
      participants: 2,
      totalCheckIns: 4,
      completedParticipants: 0,
      missedParticipants: 1,
      inProgressParticipants: 1,
      todayCheckIns: 1,
    })
    expect(response.body.daily.slice(0, 3)).toEqual([
      { dayIndex: 0, checkIns: 1, closed: true },
      { dayIndex: 1, checkIns: 2, closed: true },
      { dayIndex: 2, checkIns: 1, closed: false },
    ])
    const first = response.body.items.find(
      (item: { userUid: string }) => item.userUid === a.user.uid
    )
    expect(first).toMatchObject({
      averageTimeSeconds: 43200,
      state: 'in_progress',
      missedDayIndexes: [],
      rank: null,
      winner: false,
    })
    expect(first.records[1]).toMatchObject({
      scoreSeconds: 90000,
      checkedInAt: '2026-10-08T17:00:00.000Z',
    })
    const missed = await admin.agent.get('/api/admin/check-in?state=missed')
    expect(missed.body.items[0]).toMatchObject({
      userUid: b.user.uid,
      missedDayIndexes: [0],
      completedDays: 1,
    })
    expect(missed.body.summary).toEqual(response.body.summary)
    const missing = await admin.agent.get('/api/admin/check-in?q=不存在')
    expect(missing.body.items).toEqual([])
    expect(missing.body.summary).toEqual(response.body.summary)
    const uid = await admin.agent.get(`/api/admin/check-in?q=${a.user.uid}`)
    expect(uid.body.total).toBe(1)
  })
  it('分页明细仅含当前页且手动重新加载获得新情况', async () => {
    const admin = await adminSession()
    const users = await Promise.all(Array.from({ length: 25 }, () => createTestUser()))
    await Promise.all(users.map(({ user }) => record(user.uid, 0, 18000)))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(CHECK_IN_START.getTime() + 3600000))
    const first = await admin.agent.get('/api/admin/check-in?pageSize=24')
    const second = await admin.agent.get('/api/admin/check-in?pageSize=24&page=2')
    expect(first.body.items).toHaveLength(24)
    expect(second.body.items).toHaveLength(1)
    expect(first.body.items.map((item: { userUid: string }) => item.userUid)).not.toContain(
      second.body.items[0].userUid
    )
    expect(second.body.items[0].records).toEqual([
      { dayIndex: 0, checkedInAt: CHECK_IN_START.toISOString(), scoreSeconds: 18000 },
    ])
    await record(users[0].user.uid, 1, 18000)
    vi.setSystemTime(new Date(CHECK_IN_START.getTime() + 86400000))
    const refreshed = await admin.agent.get('/api/admin/check-in')
    expect(refreshed.body.summary.totalCheckIns).toBe(26)
    expect(refreshed.body.snapshotAt).not.toBe(first.body.snapshotAt)
  })
  it('结束后的筛选不重排名次，空活动没有虚构参与者', async () => {
    const admin = await adminSession()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T21:00:00Z'))
    const empty = await admin.agent.get('/api/admin/check-in')
    expect(empty.body.summary.participants).toBe(0)
    expect(empty.body.summary.todayCheckIns).toBeNull()
    expect(empty.body.daily.map((day: { checkIns: number }) => day.checkIns)).toEqual(
      Array(30).fill(0)
    )
    vi.useRealTimers()
    const users = await Promise.all(
      ['同分甲', '同分乙', '第三名'].map((displayName) => createTestUser({ displayName }))
    )
    for (const [index, { user }] of users.entries()) {
      await Promise.all(
        Array.from({ length: 30 }, (_, dayIndex) =>
          record(user.uid, dayIndex, index === 2 ? 25200 : 21600)
        )
      )
    }
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T21:00:00Z'))
    const filtered = await admin.agent.get('/api/admin/check-in?q=第三名')
    expect(filtered.body.items[0]).toMatchObject({ rank: 3, winner: false })
    const publicRanking = await createAnonymousAgent().get('/api/check-in/rankings')
    const all = await admin.agent.get('/api/admin/check-in')
    expect(
      all.body.items.map((item: { rank: number; winner: boolean }) => [item.rank, item.winner])
    ).toEqual(
      publicRanking.body.items.map((item: { rank: number; winner: boolean }) => [
        item.rank,
        item.winner,
      ])
    )
  })
  it('后台能查看参与者绑定的活动微信号', async () => {
    const admin = await adminSession()
    const participantUser = await createTestUser({ displayName: '微信参与者' })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(CHECK_IN_START.getTime() + 3600000))
    await record(participantUser.user.uid, 0, 18000)
    await prisma.checkInProfile.create({
      data: {
        eventId: CHECK_IN_EVENT_ID,
        userUid: participantUser.user.uid,
        wechat: 'wechat_winner_01',
      },
    })
    const response = await admin.agent.get(`/api/admin/check-in?q=${participantUser.user.uid}`)
    expect(response.status).toBe(200)
    expect(response.body.items[0].wechat).toBe('wechat_winner_01')
  })
})
