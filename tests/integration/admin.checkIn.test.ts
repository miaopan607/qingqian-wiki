import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAnonymousAgent,
  createTestUser,
  loginAgent,
  prisma,
  resetDatabase,
  seedSiteConfig,
} from './setup'
import { getCheckInEvent } from '../../src/server/services/checkInEvents'
const oldEvent = getCheckInEvent('2026-10-07')
const start = new Date(oldEvent.startsAt)
const event = getCheckInEvent()

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function adminSession(role: 'admin' | 'super_admin' | 'user' = 'admin') {
  const account = await createTestUser({ role })
  const session = await loginAgent(account.user.email, account.password)
  return { ...session, user: account.user }
}
async function record(userUid: string, dayIndex: number, scoreSeconds: number) {
  return prisma.checkIn.create({
    data: {
      eventId: oldEvent.id,
      userUid,
      dayIndex,
      scoreSeconds,
      checkedInAt: new Date(start.getTime() + dayIndex * 86400000 + (scoreSeconds - 18000) * 1000),
    },
  })
}

describe('后台签到快照', () => {
  it('仅未封禁管理员可读，活动中不解锁公开榜单', async () => {
    const admin = await adminSession()
    const superAdmin = await adminSession('super_admin')
    const normal = await adminSession('user')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(start)
    expect(
      (await createAnonymousAgent().get('/api/admin/check-in?eventId=2026-10-07')).status
    ).toBe(401)
    expect((await normal.agent.get('/api/admin/check-in?eventId=2026-10-07')).status).toBe(403)
    expect((await admin.agent.get('/api/admin/check-in?eventId=2026-10-07')).status).toBe(200)
    expect((await superAdmin.agent.get('/api/admin/check-in?eventId=2026-10-07')).status).toBe(200)
    expect((await admin.agent.get('/api/check-in/rankings?eventId=2026-10-07')).status).toBe(403)
    await prisma.user.update({ where: { uid: admin.user.uid }, data: { status: 'banned' } })
    expect((await admin.agent.get('/api/admin/check-in?eventId=2026-10-07')).status).toBe(403)
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
    const response = await admin.agent.get('/api/admin/check-in?eventId=2026-10-07')
    expect(response.body.summary).toEqual({
      participants: 2,
      totalCheckIns: 4,
      completedParticipants: 0,
      missedParticipants: 1,
      inProgressParticipants: 1,
      todayCheckIns: 1,
    })
    expect(response.body.daily.slice(0, 3)).toEqual([
      { dayIndex: 0, checkIns: 1, phase: 'ended' },
      { dayIndex: 1, checkIns: 2, phase: 'ended' },
      { dayIndex: 2, checkIns: 1, phase: 'active' },
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
    const missed = await admin.agent.get('/api/admin/check-in?eventId=2026-10-07&state=missed')
    expect(missed.body.items[0]).toMatchObject({
      userUid: b.user.uid,
      missedDayIndexes: [0],
      completedDays: 1,
    })
    expect(missed.body.summary).toEqual(response.body.summary)
    const missing = await admin.agent.get('/api/admin/check-in?eventId=2026-10-07&q=不存在')
    expect(missing.body.items).toEqual([])
    expect(missing.body.summary).toEqual(response.body.summary)
    const uid = await admin.agent.get(`/api/admin/check-in?eventId=2026-10-07&q=${a.user.uid}`)
    expect(uid.body.total).toBe(1)
  })
  it('分页明细仅含当前页且手动重新加载获得新情况', async () => {
    const admin = await adminSession()
    const users = await Promise.all(Array.from({ length: 25 }, () => createTestUser()))
    await Promise.all(users.map(({ user }) => record(user.uid, 0, 18000)))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(start.getTime() + 3600000))
    const first = await admin.agent.get('/api/admin/check-in?eventId=2026-10-07&pageSize=24')
    const second = await admin.agent.get(
      '/api/admin/check-in?eventId=2026-10-07&pageSize=24&page=2'
    )
    expect(first.body.items).toHaveLength(24)
    expect(second.body.items).toHaveLength(1)
    expect(first.body.items.map((item: { userUid: string }) => item.userUid)).not.toContain(
      second.body.items[0].userUid
    )
    expect(second.body.items[0].records).toEqual([
      { dayIndex: 0, checkedInAt: start.toISOString(), scoreSeconds: 18000 },
    ])
    await record(users[0].user.uid, 1, 18000)
    vi.setSystemTime(new Date(start.getTime() + 86400000))
    const refreshed = await admin.agent.get('/api/admin/check-in?eventId=2026-10-07')
    expect(refreshed.body.summary.totalCheckIns).toBe(26)
    expect(refreshed.body.snapshotAt).not.toBe(first.body.snapshotAt)
  })
  it('结束后的筛选不重排名次，空活动没有虚构参与者', async () => {
    const admin = await adminSession()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T21:00:00Z'))
    const empty = await admin.agent.get('/api/admin/check-in?eventId=2026-10-07')
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
    const filtered = await admin.agent.get('/api/admin/check-in?eventId=2026-10-07&q=第三名')
    expect(filtered.body.items[0]).toMatchObject({ rank: 3, winner: false })
    const publicRanking = await createAnonymousAgent().get(
      '/api/check-in/rankings?eventId=2026-10-07'
    )
    const all = await admin.agent.get('/api/admin/check-in?eventId=2026-10-07')
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
    vi.setSystemTime(new Date(start.getTime() + 3600000))
    await record(participantUser.user.uid, 0, 18000)
    await prisma.checkInProfile.create({
      data: {
        eventId: oldEvent.id,
        userUid: participantUser.user.uid,
        wechat: 'wechat_winner_01',
      },
    })
    const response = await admin.agent.get(
      `/api/admin/check-in?eventId=2026-10-07&q=${participantUser.user.uid}`
    )
    expect(response.status).toBe(200)
    expect(response.body.items[0].wechat).toBe('wechat_winner_01')
  })
})

describe('管理员事务更正与审计', () => {
  it.each(['record_set', 'record_update', 'record_delete', 'profile_update'])(
    '%s保存锁内真实前后值和身份，重算统计',
    async (action) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-22T02:00:00Z'))
      const admin = await adminSession()
      const target = await createTestUser({ displayName: '更正目标' })
      await prisma.checkInProfile.create({
        data: { eventId: event.id, userUid: target.user.uid, refreshMinute: 300 },
      })
      const base = `/api/admin/check-in/participants/${target.user.uid}`
      const time = '2026-11-21T21:01:00.999Z'
      if (action === 'record_update' || action === 'record_delete')
        await prisma.checkIn.create({
          data: {
            eventId: event.id,
            userUid: target.user.uid,
            dayIndex: 0,
            checkedInAt: new Date('2026-11-21T21:00:00Z'),
            scoreSeconds: 0,
          },
        })
      const response =
        action === 'profile_update'
          ? await admin.agent
              .patch(`${base}/profile`)
              .set('X-XSRF-TOKEN', admin.xsrf)
              .send({ wechat: ' wx_corrected ', reason: '  ' })
          : action === 'record_delete'
            ? await admin.agent.delete(`${base}/records/0`).set('X-XSRF-TOKEN', admin.xsrf).send({})
            : await admin.agent
                .put(`${base}/records/0`)
                .set('X-XSRF-TOKEN', admin.xsrf)
                .send({ checkedInAt: time })
      expect(response.status).toBe(200)
      expect(response.body.completedDays).toBe(
        action === 'record_delete' || action === 'profile_update' ? 0 : 1
      )
      const log = await prisma.checkInAuditLog.findFirstOrThrow()
      expect(log).toMatchObject({
        eventId: event.id,
        actorUid: admin.user.uid,
        actorName: admin.user.displayName,
        targetUid: target.user.uid,
        targetName: '更正目标',
        reason: null,
        action: action === 'record_update' ? 'record_set' : action,
      })
      expect(log.createdAt.getTime()).not.toBe(Date.now())
      if (action === 'profile_update') {
        expect(log.before).toMatchObject({
          wechat: null,
          initialRefreshMinute: 300,
          refreshChanges: [],
        })
        expect(log.after).toMatchObject({ wechat: 'wx_corrected' })
        await admin.agent
          .patch(`${base}/profile`)
          .set('X-XSRF-TOKEN', admin.xsrf)
          .send({ wechat: 'wx_corrected' })
          .expect(200)
      } else {
        expect(log.before).toEqual({
          record:
            action === 'record_set'
              ? null
              : { dayIndex: 0, checkedInAt: '2026-11-21T21:00:00.000Z', scoreSeconds: 0 },
        })
        expect(log.after).toEqual({
          record:
            action === 'record_delete'
              ? null
              : { dayIndex: 0, checkedInAt: '2026-11-21T21:01:00.000Z', scoreSeconds: 60 },
        })
        if (action !== 'record_delete')
          await admin.agent
            .put(`${base}/records/0`)
            .set('X-XSRF-TOKEN', admin.xsrf)
            .send({ checkedInAt: time })
            .expect(200)
      }
      expect(await prisma.checkInAuditLog.count()).toBe(1)
      const snapshot = await admin.agent.get('/api/admin/check-in')
      expect(snapshot.body.summary.totalCheckIns).toBe(response.body.completedDays)
      expect((await admin.agent.get(base)).body.userUid).toBe(target.user.uid)
      const logs = await admin.agent.get(
        `/api/admin/check-in/logs?userUid=${target.user.uid}&pageSize=1`
      )
      expect(logs.body.total).toBe(1)
      expect(logs.body.items[0].id).toBe(log.id)
      await prisma.user.delete({ where: { uid: target.user.uid } })
      expect(await prisma.checkInAuditLog.count()).toBe(1)
    }
  )
  it('权限、CSRF、非法时刻及不存在目标均不改变成绩和日志', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-22T02:00:00Z'))
    const admin = await adminSession()
    const normal = await adminSession('user')
    const target = await createTestUser()
    await prisma.checkInProfile.create({
      data: { eventId: event.id, userUid: target.user.uid, refreshMinute: 300 },
    })
    const base = `/api/admin/check-in/participants/${target.user.uid}/records/0`
    const body = { checkedInAt: '2026-11-21T21:01:00Z' }
    expect((await normal.agent.put(base).set('X-XSRF-TOKEN', normal.xsrf).send(body)).status).toBe(
      403
    )
    expect((await admin.agent.put(base).send(body)).status).toBe(403)
    for (const checkedInAt of [
      '2026-11-21T20:59:59Z',
      '2026-11-22T21:00:00Z',
      '2026-11-22T03:00:00Z',
      '2026-11-21T21:01:00',
    ])
      expect(
        (await admin.agent.put(base).set('X-XSRF-TOKEN', admin.xsrf).send({ checkedInAt })).status
      ).toBe(400)
    expect(
      (
        await admin.agent
          .put('/api/admin/check-in/participants/missing/records/0')
          .set('X-XSRF-TOKEN', admin.xsrf)
          .send(body)
      ).status
    ).toBe(404)
    const unset = await createTestUser()
    expect(
      (
        await admin.agent
          .put(`/api/admin/check-in/participants/${unset.user.uid}/records/0`)
          .set('X-XSRF-TOKEN', admin.xsrf)
          .send(body)
      ).body.code
    ).toBe('CHECK_IN_REFRESH_REQUIRED')
    expect(await prisma.checkInProfile.count({ where: { userUid: unset.user.uid } })).toBe(0)
    await prisma.user.update({ where: { uid: admin.user.uid }, data: { status: 'banned' } })
    expect((await admin.agent.put(base).set('X-XSRF-TOKEN', admin.xsrf).send(body)).status).toBe(
      403
    )
    expect((await admin.agent.get('/api/admin/check-in/logs')).status).toBe(403)
    expect(await prisma.checkIn.count()).toBe(0)
    expect(await prisma.checkInAuditLog.count()).toBe(0)
  })
  it('旧活动结束后可更正时间和微信，撤销最后记录仍可UID直达', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-12T00:00:00Z'))
    const admin = await adminSession()
    const target = await createTestUser()
    const base = `/api/admin/check-in/participants/${target.user.uid}`
    const query = `?eventId=${oldEvent.id}`
    await admin.agent
      .put(`${base}/records/0${query}`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ checkedInAt: '2026-10-06T22:00:00Z', reason: '真实补录' })
      .expect(200)
    expect((await admin.agent.get(`${base}${query}`)).body.averageTimeSeconds).toBe(21600)
    await admin.agent
      .patch(`${base}/profile${query}`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ wechat: 'wx_old' })
      .expect(200)
    expect(
      (
        await admin.agent
          .patch(`${base}/profile${query}`)
          .set('X-XSRF-TOKEN', admin.xsrf)
          .send({ refreshMinute: 540 })
      ).body.code
    ).toBe('CHECK_IN_NO_FUTURE_REFRESH')
    await admin.agent
      .delete(`${base}/records/0${query}`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({})
      .expect(200)
    expect((await admin.agent.get(`${base}${query}`)).body.completedDays).toBe(0)
    expect((await admin.agent.get(`/api/admin/check-in${query}`)).body.total).toBe(0)
    expect((await admin.agent.get(`/api/admin/check-in/logs${query}`)).body.total).toBe(3)
    expect((await admin.agent.get('/api/admin/check-in/logs')).body.total).toBe(0)
  })
  it('并发用户签到及管理员改时的最终记录与串行审计一致', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T21:02:00Z'))
    const admin = await adminSession()
    const target = await createTestUser()
    const currentSession = await loginAgent(target.user.email, target.password)
    await prisma.checkInProfile.create({
      data: { eventId: event.id, userUid: target.user.uid, refreshMinute: 300 },
    })
    vi.stubEnv('TURNSTILE_SITE_KEY', 'site')
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret')
    vi.stubEnv('TURNSTILE_HOSTNAMES', 'localhost')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, action: 'check-in', hostname: 'localhost' }))
      )
    )
    const base = `/api/admin/check-in/participants/${target.user.uid}/records/0`
    const results = await Promise.all([
      currentSession.agent
        .post('/api/check-in')
        .set('X-XSRF-TOKEN', currentSession.xsrf)
        .send({ turnstileToken: 'ok', dayIndex: 0 }),
      admin.agent
        .put(base)
        .set('X-XSRF-TOKEN', admin.xsrf)
        .send({ checkedInAt: '2026-11-21T21:01:00Z' }),
    ])
    expect([201, 409]).toContain(results[0].status)
    expect(results[1].status).toBe(200)
    const record = await prisma.checkIn.findFirstOrThrow()
    const log = await prisma.checkInAuditLog.findFirstOrThrow()
    expect(await prisma.checkIn.count()).toBe(1)
    expect(record.scoreSeconds).toBe(60)
    expect(log.after).toMatchObject({
      record: { checkedInAt: record.checkedInAt.toISOString(), scoreSeconds: record.scoreSeconds },
    })
  })
  it('审计持久化失败时业务与事务内创建的档案一并回滚', async () => {
    const admin = await adminSession()
    const target = await createTestUser()
    await prisma.$executeRaw`ALTER TABLE "CheckInAuditLog" ADD CONSTRAINT "test_audit_failure" CHECK ("action" <> 'profile_update')`
    try {
      const response = await admin.agent
        .patch(`/api/admin/check-in/participants/${target.user.uid}/profile`)
        .set('X-XSRF-TOKEN', admin.xsrf)
        .send({ wechat: 'wx_rollback' })
      expect(response.status).toBe(500)
      expect(await prisma.checkInProfile.count({ where: { userUid: target.user.uid } })).toBe(0)
      expect(await prisma.checkInAuditLog.count()).toBe(0)
    } finally {
      await prisma.$executeRaw`ALTER TABLE "CheckInAuditLog" DROP CONSTRAINT "test_audit_failure"`
    }
  })
})

describe('管理员未来改点', () => {
  it('改点保留已签分数，交接窗口连续，次日按新起点计60秒', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-22T02:00:00Z'))
    const admin = await adminSession()
    const target = await createTestUser()
    const session = await loginAgent(target.user.email, target.password)
    await prisma.checkInProfile.create({
      data: { eventId: event.id, userUid: target.user.uid, refreshMinute: 300 },
    })
    await prisma.checkIn.create({
      data: {
        eventId: event.id,
        userUid: target.user.uid,
        dayIndex: 0,
        scoreSeconds: 60,
        checkedInAt: new Date('2026-11-21T21:01:00Z'),
      },
    })
    const base = `/api/admin/check-in/participants/${target.user.uid}`
    const changed = await admin.agent
      .patch(`${base}/profile`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ refreshMinute: 540 })
    expect(changed.status).toBe(200)
    expect(changed.body).toMatchObject({
      initialRefreshMinute: 300,
      refreshMinute: 300,
      refreshChanges: [{ fromDayIndex: 1, refreshMinute: 540 }],
      records: [{ dayIndex: 0, scoreSeconds: 60 }],
    })
    expect(changed.body.dayWindows[0].endsAt).toBe('2026-11-23T01:00:00.000Z')
    const repeated = await admin.agent
      .patch(`${base}/profile`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ refreshMinute: 540 })
    expect(repeated.body.refreshChanges).toHaveLength(1)
    await admin.agent
      .patch(`${base}/profile`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ refreshMinute: 240 })
      .expect(200)
    const overridden = await admin.agent
      .patch(`${base}/profile`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ refreshMinute: 540 })
    expect(overridden.body.refreshChanges).toHaveLength(3)
    expect(overridden.body.dayWindows[0].endsAt).toBe('2026-11-23T01:00:00.000Z')
    vi.setSystemTime(new Date('2026-11-23T01:01:00Z'))
    vi.stubEnv('TURNSTILE_SITE_KEY', 'site')
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'secret')
    vi.stubEnv('TURNSTILE_HOSTNAMES', 'localhost')
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, action: 'check-in', hostname: 'localhost' }))
      )
    )
    expect(
      (
        await session.agent
          .post('/api/check-in')
          .set('X-XSRF-TOKEN', session.xsrf)
          .send({ turnstileToken: 'ok', dayIndex: 1 })
      ).body.record.scoreSeconds
    ).toBe(60)
    const detail = await admin.agent.get(base)
    expect(detail.body.refreshMinute).toBe(540)
    expect(detail.body.records[0].scoreSeconds).toBe(60)
    expect((await admin.agent.get('/api/admin/check-in')).body.summary.todayCheckIns).toBe(1)
  })
  it.each([
    ['2026-11-22T02:00:00Z', 240, 1],
    ['2026-11-22T20:59:00Z', 240, 2],
    ['2026-12-21T20:59:00Z', 1439, 30],
    ['2026-12-21T21:00:00Z', 1439, null],
  ])('%s调整为%s只追加可用未来边界', async (time, refreshMinute, fromDayIndex) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(time))
    const admin = await adminSession()
    const target = await createTestUser()
    await prisma.checkInProfile.create({
      data: { eventId: event.id, userUid: target.user.uid, refreshMinute: 300 },
    })
    const response = await admin.agent
      .patch(`/api/admin/check-in/participants/${target.user.uid}/profile`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ refreshMinute })
    if (fromDayIndex === null) {
      expect(response.body.code).toBe('CHECK_IN_NO_FUTURE_REFRESH')
      expect(await prisma.checkInAuditLog.count()).toBe(0)
    } else {
      expect(response.status).toBe(200)
      expect(response.body.refreshChanges[0].fromDayIndex).toBe(fromDayIndex)
      const windows = response.body.dayWindows as { startsAt: string; endsAt: string }[]
      expect(windows).toHaveLength(30)
      windows.forEach((window, index) => {
        expect(Date.parse(window.endsAt)).toBeGreaterThan(Date.parse(window.startsAt))
        if (index) expect(window.startsAt).toBe(windows[index - 1].endsAt)
      })
    }
  })
  it('首次设点零记录计入参与者，微信单独不计，个人今日统计与全局包络独立', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-22T00:00:00Z'))
    const admin = await adminSession()
    const a = await createTestUser()
    const b = await createTestUser()
    await admin.agent
      .patch(`/api/admin/check-in/participants/${a.user.uid}/profile`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ refreshMinute: 540 })
      .expect(200)
    await admin.agent
      .patch(`/api/admin/check-in/participants/${b.user.uid}/profile`)
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ wechat: 'wx_only' })
      .expect(200)
    const snapshot = await admin.agent.get('/api/admin/check-in')
    expect(snapshot.body.summary).toMatchObject({
      participants: 1,
      todayCheckIns: 0,
      totalCheckIns: 0,
    })
    expect(snapshot.body.items[0]).toMatchObject({
      phase: 'upcoming',
      dayIndex: null,
      averageTimeSeconds: null,
    })
    expect(snapshot.body.daily[0].phase).toBe('active')
    expect(
      (await admin.agent.get(`/api/admin/check-in/participants/${b.user.uid}`)).body.dayWindows
    ).toEqual([])
  })
})
