import { beforeEach, describe, expect, it } from 'vitest'

import {
  createAnonymousAgent,
  createTestUser,
  loginAgent,
  prisma,
  resetDatabase,
  seedSiteConfig,
  setRegistrationOpen,
} from './setup'

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})

describe('注册', () => {
  it('注册后自动登录并返回当前用户', async () => {
    const agent = createAnonymousAgent()
    const response = await agent
      .post('/api/auth/register')
      .send({ email: 'Fan@QQ.test', displayName: '小粉丝', password: 'fan2026pass' })

    expect(response.status).toBe(201)
    expect(response.body.user.email).toBe('fan@qq.test')

    const me = await agent.get('/api/auth/me')
    expect(me.body.user?.displayName).toBe('小粉丝')
  })

  it('邮箱重复返回 409', async () => {
    await createTestUser({ email: 'fan@qq.test', displayName: '已有用户' })

    const response = await createAnonymousAgent()
      .post('/api/auth/register')
      .send({ email: 'fan@qq.test', displayName: '另一个昵称', password: 'fan2026pass' })

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('该邮箱已注册')
  })

  it('昵称重复返回 409', async () => {
    await createTestUser({ email: 'a@qq.test', displayName: '清浅' })

    const response = await createAnonymousAgent()
      .post('/api/auth/register')
      .send({ email: 'b@qq.test', displayName: '清浅', password: 'fan2026pass' })

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('该昵称已被使用')
  })

  it('关闭注册后返回 403', async () => {
    await setRegistrationOpen(false)

    const response = await createAnonymousAgent()
      .post('/api/auth/register')
      .send({ email: 'new@qq.test', displayName: '新用户', password: 'fan2026pass' })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('REGISTRATION_CLOSED')
  })
})

describe('登录与会话', () => {
  it('密码错误返回 401，正确后登出清空会话', async () => {
    const { user, password } = await createTestUser({ email: 'fan@qq.test', displayName: '小粉丝' })

    const wrong = await createAnonymousAgent()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'wrongPassword1' })
    expect(wrong.status).toBe(401)

    const { agent, xsrf } = await loginAgent(user.email, password)
    const me = await agent.get('/api/auth/me')
    expect(me.body.user?.uid).toBe(user.uid)

    await agent.post('/api/auth/logout').set('X-XSRF-TOKEN', xsrf)
    const afterLogout = await agent.get('/api/auth/me')
    expect(afterLogout.body.user).toBeNull()
  })

  it('已登录写请求缺少 CSRF 头返回 403', async () => {
    const { user, password } = await createTestUser({ email: 'fan@qq.test', displayName: '小粉丝' })
    const { agent } = await loginAgent(user.email, password)

    const response = await agent.patch('/api/me').send({ bio: '缺少 CSRF' })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('CSRF_MISSING')
  })

  it('被封禁用户无法登录', async () => {
    const { user, password } = await createTestUser({ email: 'fan@qq.test', displayName: '小粉丝' })
    await prisma.user.update({ where: { uid: user.uid }, data: { status: 'banned' } })

    const response = await createAnonymousAgent()
      .post('/api/auth/login')
      .send({ email: user.email, password })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('USER_BANNED')
  })
})

describe('公开配置', () => {
  it('返回站点名称与注册开关', async () => {
    const response = await createAnonymousAgent().get('/api/config/public')

    expect(response.status).toBe(200)
    expect(response.body.name).toBe('清浅 Wiki')
    expect(response.body.registrationOpen).toBe(true)
  })
})
