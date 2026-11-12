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
const event = getCheckInEvent()
const oldEvent = getCheckInEvent('2026-10-07')
const start = new Date('2026-11-21T21:00:00Z')

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
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
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function participant(now = start) {
  const { user, password } = await createTestUser()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  const session = await loginAgent(user.email, password)
  await session.agent
    .put('/api/check-in/refresh-time')
    .set('X-XSRF-TOKEN', session.xsrf)
    .send({ refreshMinute: 300 })
    .expect(200)
  return { ...session, user }
}

async function seedDays(userUid: string, count: number, scoreSeconds: number) {
  await prisma.checkIn.createMany({
    data: Array.from({ length: count }, (_, dayIndex) => ({
      userUid,
      eventId: oldEvent.id,
      dayIndex,
      scoreSeconds,
      checkedInAt: new Date(
        Date.parse(oldEvent.startsAt) + dayIndex * 86400000 + (scoreSeconds - 18000) * 1000
      ),
    })),
  })
}

describe('签到接口', () => {
  it('保留首次签到且并发只能产生一条记录', async () => {
    const { agent, xsrf, user } = await participant()
    const results = await Promise.all(
      ['a', 'b'].map((turnstileToken) =>
        agent.post('/api/check-in').set('X-XSRF-TOKEN', xsrf).send({ turnstileToken, dayIndex: 0 })
      )
    )
    expect(results.map((res) => res.status).sort()).toEqual([201, 409])
    expect(await prisma.checkIn.count({ where: { userUid: user.uid } })).toBe(1)
    vi.setSystemTime(new Date(start.getTime() + 3600000))
    const again = await agent
      .post('/api/check-in')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ turnstileToken: 'c', dayIndex: 0 })
    expect(again.body.code).toBe('CHECK_IN_ALREADY_DONE')
    const status = await agent.get('/api/check-in')
    expect(status.body.me.records[0].checkedInAt).toBe(start.toISOString())
    expect(status.body.me.averageTimeSeconds).toBe(0)
  })
  it('认证、封禁及CSRF不可绕过', async () => {
    const { agent, xsrf, user } = await participant()
    expect(
      (
        await createAnonymousAgent()
          .post('/api/check-in')
          .send({ turnstileToken: 'a', dayIndex: 0 })
      ).status
    ).toBe(401)
    expect(
      (await agent.post('/api/check-in').send({ turnstileToken: 'a', dayIndex: 0 })).status
    ).toBe(403)
    await prisma.user.update({ where: { uid: user.uid }, data: { status: 'banned' } })
    expect(
      (
        await agent
          .post('/api/check-in')
          .set('X-XSRF-TOKEN', xsrf)
          .send({ turnstileToken: 'a', dayIndex: 0 })
      ).status
    ).toBe(403)
    expect(await prisma.checkIn.count()).toBe(0)
  })
  it('活动外与验证跨签到日不写记录', async () => {
    const { agent, xsrf } = await participant()
    const post = () =>
      agent
        .post('/api/check-in')
        .set('X-XSRF-TOKEN', xsrf)
        .send({ turnstileToken: 'a', dayIndex: 0 })
    vi.setSystemTime(new Date(start.getTime() - 1000))
    expect((await post()).body.code).toBe('CHECK_IN_NOT_STARTED')
    vi.setSystemTime(start)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.setSystemTime(new Date(start.getTime() + 86400000))
        return new Response(
          JSON.stringify({ success: true, action: 'check-in', hostname: 'localhost' })
        )
      })
    )
    expect((await post()).body.code).toBe('CHECK_IN_DAY_CHANGED')
    expect(await prisma.checkIn.count()).toBe(0)
  })
  it('验证通过时已经截止仍拒绝写入', async () => {
    const { agent, xsrf } = await participant(new Date('2026-12-21T20:59:59Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.setSystemTime(new Date('2026-12-21T21:00:00Z'))
        return new Response(
          JSON.stringify({ success: true, action: 'check-in', hostname: 'localhost' })
        )
      })
    )
    const result = await agent
      .post('/api/check-in')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ turnstileToken: 'last', dayIndex: 29 })
    expect(result.status).toBe(409)
    expect(result.body.code).toBe('CHECK_IN_ENDED')
    expect(await prisma.checkIn.count()).toBe(0)
  })
  it('验证失败、服务不可用或配置缺失均失败封闭', async () => {
    const { agent, xsrf } = await participant()
    const post = () =>
      agent
        .post('/api/check-in')
        .set('X-XSRF-TOKEN', xsrf)
        .send({ turnstileToken: 'a', dayIndex: 0 })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }))
      )
    )
    expect((await post()).status).toBe(400)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      })
    )
    expect((await post()).status).toBe(503)
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    expect((await post()).body.code).toBe('TURNSTILE_NOT_CONFIGURED')
    expect(await prisma.checkIn.count()).toBe(0)
  })
  it('结束后按全榜总分判定并列，漏签不参与获奖', async () => {
    const users = await Promise.all(Array.from({ length: 4 }, () => createTestUser()))
    await seedDays(users[0].user.uid, 30, 21600)
    await seedDays(users[1].user.uid, 30, 21600)
    await seedDays(users[2].user.uid, 30, 25200)
    await seedDays(users[3].user.uid, 29, 18000)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(oldEvent.startsAt))
    const agent = createAnonymousAgent()
    expect((await agent.get('/api/check-in/rankings?eventId=2026-10-07')).status).toBe(403)
    vi.setSystemTime(new Date('2026-11-05T21:00:00Z'))
    const res = await agent.get('/api/check-in/rankings?eventId=2026-10-07')
    expect(
      res.body.items.map((item: { rank: number | null; winner: boolean }) => [
        item.rank,
        item.winner,
      ])
    ).toEqual([
      [1, true],
      [1, true],
      [3, false],
      [null, false],
    ])
    const second = await agent.get('/api/check-in/rankings?eventId=2026-10-07&page=2&pageSize=1')
    expect(second.body.items[0].rank).toBe(1)
    expect(second.body.items[0].winner).toBe(true)
    const third = await agent.get('/api/check-in/rankings?eventId=2026-10-07&page=3&pageSize=1')
    expect(third.body.items[0].rank).toBe(3)
  })
  it('空榜与无人签满均无获奖者', async () => {
    const { user } = await createTestUser()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T21:00:00Z'))
    const agent = createAnonymousAgent()
    expect((await agent.get('/api/check-in/rankings?eventId=2026-10-07')).body.items).toEqual([])
    await seedDays(user.uid, 29, 18000)
    const result = await agent.get('/api/check-in/rankings?eventId=2026-10-07')
    expect(result.body.qualifiedTotal).toBe(0)
    expect(result.body.items[0]).toMatchObject({
      rank: null,
      winner: false,
      averageTimeSeconds: null,
    })
  })
  it('可随时绑定、修改或清除微信号，并在个人进度中返回', async () => {
    const { agent, xsrf, user } = await participant()
    const updateWechat = (wechat: string | null) =>
      agent.put('/api/check-in/wechat').set('X-XSRF-TOKEN', xsrf).send({ wechat })
    const initial = await agent.get('/api/check-in')
    expect(initial.body.me.wechat).toBeNull()
    const bind = await updateWechat('v_qianqian2026')
    expect(bind.status).toBe(200)
    expect(bind.body.wechat).toBe('v_qianqian2026')
    const meAfterBind = await agent.get('/api/check-in')
    expect(meAfterBind.body.me.wechat).toBe('v_qianqian2026')
    const update = await updateWechat('v_qianqian_new')
    expect(update.status).toBe(200)
    expect(update.body.wechat).toBe('v_qianqian_new')
    const clear = await updateWechat(null)
    expect(clear.status).toBe(200)
    expect(clear.body.wechat).toBeNull()
    const meAfterClear = await agent.get('/api/check-in')
    expect(meAfterClear.body.me.wechat).toBeNull()
    const invalid = await updateWechat('invalid wechat space!')
    expect(invalid.status).toBe(400)
  })
})

describe('个人设点锁定及活动隔离', () => {
  it('并发确认仅一次成功，清空微信和重新登录都不解锁', async () => {
    const account = await createTestUser()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(start)
    const session = await loginAgent(account.user.email, account.password)
    const results = await Promise.all(
      [300, 540].map((refreshMinute) =>
        session.agent
          .put('/api/check-in/refresh-time')
          .set('X-XSRF-TOKEN', session.xsrf)
          .send({ refreshMinute })
      )
    )
    expect(results.map((item) => item.status).sort()).toEqual([200, 409])
    const profile = await prisma.checkInProfile.findUniqueOrThrow({
      where: { eventId_userUid: { eventId: event.id, userUid: account.user.uid } },
    })
    await session.agent
      .put('/api/check-in/wechat')
      .set('X-XSRF-TOKEN', session.xsrf)
      .send({ wechat: null })
      .expect(200)
    const again = await loginAgent(account.user.email, account.password)
    const response = await again.agent
      .put('/api/check-in/refresh-time')
      .set('X-XSRF-TOKEN', again.xsrf)
      .send({ refreshMinute: profile.refreshMinute })
    expect(response.body.code).toBe('CHECK_IN_REFRESH_LOCKED')
    expect((await again.agent.get('/api/check-in')).body.me.initialRefreshMinute).toBe(
      profile.refreshMinute
    )
  })
  it.each([
    [0, '2026-11-21T16:00:00Z', 0],
    [300, '2026-11-21T21:00:00Z', 0],
    [300, '2026-11-21T21:01:00Z', 60],
    [540, '2026-11-22T01:01:00Z', 60],
  ])('%s分钟用户在%s按个人耗时计分', async (refreshMinute, time, scoreSeconds) => {
    const account = await createTestUser()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T15:00:00Z'))
    const session = await loginAgent(account.user.email, account.password)
    await session.agent
      .put('/api/check-in/refresh-time')
      .set('X-XSRF-TOKEN', session.xsrf)
      .send({ refreshMinute })
      .expect(200)
    vi.setSystemTime(
      new Date(Date.parse(`${event.startsOn}T00:00:00+08:00`) + refreshMinute * 60000 - 1000)
    )
    const post = () =>
      session.agent
        .post('/api/check-in')
        .set('X-XSRF-TOKEN', session.xsrf)
        .send({ turnstileToken: 'ok', dayIndex: 0 })
    expect((await post()).body.code).toBe('CHECK_IN_NOT_STARTED')
    vi.setSystemTime(new Date(time))
    expect((await post()).body.record.scoreSeconds).toBe(scoreSeconds)
  })
  it('未设点不创建窗口，归档用户写入和未知/dev活动均被拒绝', async () => {
    const account = await createTestUser()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(start)
    const session = await loginAgent(account.user.email, account.password)
    const status = await session.agent.get('/api/check-in')
    expect(status.body).toMatchObject({
      phase: 'active',
      dayIndex: null,
      me: { initialRefreshMinute: null, dayWindows: [] },
    })
    expect(
      (
        await session.agent
          .post('/api/check-in')
          .set('X-XSRF-TOKEN', session.xsrf)
          .send({ turnstileToken: 'ok', dayIndex: 0 })
      ).body.code
    ).toBe('CHECK_IN_REFRESH_REQUIRED')
    for (const path of ['/api/check-in', '/api/check-in/refresh-time', '/api/check-in/wechat']) {
      const response = await (
        path === '/api/check-in'
          ? session.agent.post(`${path}?eventId=${oldEvent.id}`)
          : session.agent.put(`${path}?eventId=${oldEvent.id}`)
      )
        .set('X-XSRF-TOKEN', session.xsrf)
        .send(
          path.endsWith('wechat')
            ? { wechat: null }
            : path.endsWith('refresh-time')
              ? { refreshMinute: 300 }
              : { dayIndex: 0, turnstileToken: 'ok' }
        )
      expect(response.body.code).toBe('CHECK_IN_ARCHIVED')
    }
    for (const id of ['missing', 'dev-2026-11-22'])
      expect((await session.agent.get(`/api/check-in?eventId=${id}`)).body.code).toBe(
        'CHECK_IN_EVENT_NOT_FOUND'
      )
    expect(await prisma.checkInProfile.count()).toBe(0)
  })
  it.each([0, 1439])('个人最后边界%s分钟后拒绝设点，不补建过去记录', async (refreshMinute) => {
    const account = await createTestUser()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(Date.parse('2026-12-22T00:00:00+08:00') + refreshMinute * 60000))
    const session = await loginAgent(account.user.email, account.password)
    const result = await session.agent
      .put('/api/check-in/refresh-time')
      .set('X-XSRF-TOKEN', session.xsrf)
      .send({ refreshMinute })
    expect(result.body.code).toBe('CHECK_IN_ENDED')
    expect(await prisma.checkInProfile.count()).toBe(0)
    expect(await prisma.checkIn.count()).toBe(0)
  })
})

describe('新旧榜单隔离', () => {
  it('不同个人刷新点每天60秒并列，29天无排名，所有人结束才公示', async () => {
    const users = await Promise.all(
      [300, 540, 1439].map(async (refreshMinute, index) => {
        const account = await createTestUser()
        await prisma.checkInProfile.create({
          data: { eventId: event.id, userUid: account.user.uid, refreshMinute },
        })
        await prisma.checkIn.createMany({
          data: Array.from({ length: index === 2 ? 29 : 30 }, (_, dayIndex) => ({
            eventId: event.id,
            userUid: account.user.uid,
            dayIndex,
            scoreSeconds: 60,
            checkedInAt: new Date(
              Date.parse(event.startsAt) + dayIndex * 86400000 + refreshMinute * 60000 + 60000
            ),
          })),
        })
        return account
      })
    )
    await seedDays(users[0].user.uid, 30, 21600)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-22T15:58:59Z'))
    const agent = createAnonymousAgent()
    expect((await agent.get('/api/check-in/rankings')).status).toBe(403)
    vi.setSystemTime(new Date(event.rankingsAvailableAt))
    const result = await agent.get('/api/check-in/rankings')
    expect(result.body.qualifiedTotal).toBe(2)
    expect(
      result.body.items.map(
        (item: {
          rank: number | null
          winner: boolean | null
          averageTimeSeconds: number | null
        }) => [item.rank, item.winner, item.averageTimeSeconds]
      )
    ).toEqual([
      [1, null, 60],
      [1, null, 60],
      [null, null, null],
    ])
    expect((await agent.get('/api/check-in/rankings?page=2&pageSize=1')).body.items[0].rank).toBe(1)
    const legacy = await agent.get(`/api/check-in/rankings?eventId=${oldEvent.id}`)
    expect(legacy.body.items).toHaveLength(1)
    expect(legacy.body.items[0]).toMatchObject({ averageTimeSeconds: 21600, winner: true })
  })
})
