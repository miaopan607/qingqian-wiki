import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'

import { app, createAnonymousAgent, resetDatabase, seedSiteConfig } from './setup'

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})

describe('站点初始化', () => {
  it('空库时要求初始化', async () => {
    const response = await request(app).get('/api/setup/status')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ initialized: false, requiresSetup: true })
  })

  it('初始化创建超级管理员并直接登录', async () => {
    const agent = createAnonymousAgent()
    const response = await agent
      .post('/api/setup/initialize')
      .send({ email: 'Admin@QQ.test', displayName: '清浅', password: 'qianqian2026' })

    expect(response.status).toBe(201)
    expect(response.body.user.role).toBe('super_admin')
    expect(response.body.user.email).toBe('admin@qq.test')

    const me = await agent.get('/api/auth/me')
    expect(me.body.user?.uid).toBe(response.body.user.uid)

    const status = await request(app).get('/api/setup/status')
    expect(status.body).toEqual({ initialized: true, requiresSetup: false })
  })

  it('已初始化后再次调用返回 409', async () => {
    const payload = { email: 'admin@qq.test', displayName: '清浅', password: 'qianqian2026' }
    await request(app).post('/api/setup/initialize').send(payload)

    const second = await request(app)
      .post('/api/setup/initialize')
      .send({ ...payload, email: 'other@qq.test', displayName: '另一个人' })

    expect(second.status).toBe(409)
    expect(second.body.error).toContain('已完成初始化')
  })

  it('弱密码被拒绝且不创建账号', async () => {
    const response = await request(app)
      .post('/api/setup/initialize')
      .send({ email: 'admin@qq.test', displayName: '清浅', password: 'password' })

    expect(response.status).toBe(400)
    expect(response.body.fields?.password).toContain('数字')

    const status = await request(app).get('/api/setup/status')
    expect(status.body.requiresSetup).toBe(true)
  })
})
