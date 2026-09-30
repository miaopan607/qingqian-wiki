import { beforeEach, describe, expect, it } from 'vitest'

import {
  createAnonymousAgent,
  createTestUser,
  loginAgent,
  resetDatabase,
  seedSiteConfig,
} from './setup'

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})

describe('个人资料', () => {
  it('修改昵称与简介', async () => {
    const { user, password } = await createTestUser({ displayName: '小粉丝' })
    const { agent, xsrf } = await loginAgent(user.email, password)

    const response = await agent
      .patch('/api/me')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ displayName: '清浅的小粉丝', bio: '喜欢键帽' })

    expect(response.status).toBe(200)
    expect(response.body.user.displayName).toBe('清浅的小粉丝')
    expect(response.body.user.bio).toBe('喜欢键帽')
  })

  it('昵称与他人重复返回 409', async () => {
    await createTestUser({ email: 'a@qq.test', displayName: '清浅' })
    const { user, password } = await createTestUser({ email: 'b@qq.test', displayName: '小粉丝' })
    const { agent, xsrf } = await loginAgent(user.email, password)

    const response = await agent
      .patch('/api/me')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ displayName: '清浅' })

    expect(response.status).toBe(409)
    expect(response.body.error).toBe('该昵称已被使用')
  })

  it('未登录修改资料返回 401', async () => {
    const response = await createAnonymousAgent().patch('/api/me').send({ bio: '匿名修改' })

    expect(response.status).toBe(401)
  })
})

describe('用户管理（超级管理员）', () => {
  async function loginAsSuperAdmin() {
    const { user, password } = await createTestUser({
      role: 'super_admin',
      displayName: '站长',
    })
    const { agent, xsrf } = await loginAgent(user.email, password)
    return { agent, xsrf, superAdmin: user }
  }

  it('普通用户访问用户列表返回 403', async () => {
    const { user, password } = await createTestUser({ displayName: '小粉丝' })
    const { agent } = await loginAgent(user.email, password)

    const response = await agent.get('/api/admin/users')

    expect(response.status).toBe(403)
  })

  it('封禁用户后其写操作被拒绝且无法重新登录', async () => {
    const { agent, xsrf } = await loginAsSuperAdmin()
    const { user, password } = await createTestUser({ displayName: '小粉丝' })
    const { agent: userAgent, xsrf: userXsrf } = await loginAgent(user.email, password)

    const banned = await agent
      .patch(`/api/admin/users/${user.uid}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ status: 'banned', banReason: '违规内容' })
    expect(banned.status).toBe(200)
    expect(banned.body.user.status).toBe('banned')
    expect(banned.body.user.banReason).toBe('违规内容')

    const write = await userAgent
      .patch('/api/me')
      .set('X-XSRF-TOKEN', userXsrf)
      .send({ bio: '被禁' })
    expect(write.status).toBe(403)
    expect(write.body.code).toBe('USER_BANNED')
  })

  it('重置密码后旧密码失效、新密码可登录', async () => {
    const { agent, xsrf } = await loginAsSuperAdmin()
    const { user, password } = await createTestUser({ displayName: '小粉丝' })

    const reset = await agent
      .post(`/api/admin/users/${user.uid}/password`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ password: 'newFan2026' })
    expect(reset.status).toBe(200)

    const oldLogin = await createAnonymousAgent()
      .post('/api/auth/login')
      .send({ email: user.email, password })
    expect(oldLogin.status).toBe(401)

    const newLogin = await createAnonymousAgent()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'newFan2026' })
    expect(newLogin.status).toBe(200)
  })

  it('超级管理员不能修改自己的状态或角色', async () => {
    const { agent, xsrf, superAdmin } = await loginAsSuperAdmin()

    const response = await agent
      .patch(`/api/admin/users/${superAdmin.uid}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ role: 'user' })

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('不能修改自己')
  })

  it('用户列表支持关键词与角色筛选', async () => {
    const { agent } = await loginAsSuperAdmin()
    await createTestUser({ email: 'fan@qq.test', displayName: '小粉丝', role: 'admin' })

    const response = await agent.get('/api/admin/users?q=fan&role=admin')

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(1)
    expect(response.body.items[0].role).toBe('admin')
    expect(response.body.items[0].galleriesCount).toBe(0)
  })
})
