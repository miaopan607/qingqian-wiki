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

async function participant(now = CHECK_IN_START) {
  const { user, password } = await createTestUser()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  const session = await loginAgent(user.email, password)
  return { ...session, user }
}

async function seedDays(userUid: string, count: number, scoreSeconds: number) {
  await prisma.checkIn.createMany({
    data: Array.from({ length: count }, (_, dayIndex) => ({
      userUid,
      eventId: CHECK_IN_EVENT_ID,
      dayIndex,
      scoreSeconds,
      checkedInAt: new Date(
        CHECK_IN_START.getTime() + dayIndex * 86400000 + (scoreSeconds - 18000) * 1000
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
    vi.setSystemTime(new Date(CHECK_IN_START.getTime() + 3600000))
    const again = await agent
      .post('/api/check-in')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ turnstileToken: 'c', dayIndex: 0 })
    expect(again.body.code).toBe('CHECK_IN_ALREADY_DONE')
    const status = await agent.get('/api/check-in')
    expect(status.body.me.records[0].checkedInAt).toBe(CHECK_IN_START.toISOString())
    expect(status.body.me.averageTimeSeconds).toBe(18000)
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
    vi.setSystemTime(new Date(CHECK_IN_START.getTime() - 1000))
    expect((await post()).body.code).toBe('CHECK_IN_NOT_STARTED')
    vi.setSystemTime(CHECK_IN_START)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.setSystemTime(new Date(CHECK_IN_START.getTime() + 86400000))
        return new Response(
          JSON.stringify({ success: true, action: 'check-in', hostname: 'localhost' })
        )
      })
    )
    expect((await post()).body.code).toBe('CHECK_IN_DAY_CHANGED')
    expect(await prisma.checkIn.count()).toBe(0)
  })
  it('验证通过时已经截止仍拒绝写入', async () => {
    const { agent, xsrf } = await participant(new Date('2026-11-05T20:59:59Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        vi.setSystemTime(new Date('2026-11-05T21:00:00Z'))
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
    vi.setSystemTime(CHECK_IN_START)
    const agent = createAnonymousAgent()
    expect((await agent.get('/api/check-in/rankings')).status).toBe(403)
    vi.setSystemTime(new Date('2026-11-05T21:00:00Z'))
    const res = await agent.get('/api/check-in/rankings')
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
    const second = await agent.get('/api/check-in/rankings?page=2&pageSize=1')
    expect(second.body.items[0].rank).toBe(1)
    expect(second.body.items[0].winner).toBe(true)
    const third = await agent.get('/api/check-in/rankings?page=3&pageSize=1')
    expect(third.body.items[0].rank).toBe(3)
  })
  it('空榜与无人签满均无获奖者', async () => {
    const { user } = await createTestUser()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-05T21:00:00Z'))
    const agent = createAnonymousAgent()
    expect((await agent.get('/api/check-in/rankings')).body.items).toEqual([])
    await seedDays(user.uid, 29, 18000)
    const result = await agent.get('/api/check-in/rankings')
    expect(result.body.qualifiedTotal).toBe(0)
    expect(result.body.items[0]).toMatchObject({
      rank: null,
      winner: false,
      averageTimeSeconds: null,
    })
  })
})
