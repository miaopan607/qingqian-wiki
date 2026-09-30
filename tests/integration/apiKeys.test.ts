import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  app,
  createTestImageBuffer,
  createTestUser,
  loginAgent,
  resetDatabase,
  seedSiteConfig,
  uploadTestAsset,
  prisma,
} from './setup'

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})

async function issueKey(
  role: 'user' | 'admin' | 'super_admin' = 'user',
  input: { name?: string; scope?: 'read' | 'read_write'; expiresInDays?: 30 | 90 | 365 | null } = {}
) {
  const { user, password } = await createTestUser({ role })
  const { agent, xsrf } = await loginAgent(user.email, password)
  const response = await agent
    .post('/api/me/api-keys')
    .set('X-XSRF-TOKEN', xsrf)
    .send({
      name: input.name ?? '自动化脚本',
      scope: input.scope ?? 'read',
      expiresInDays: input.expiresInDays === undefined ? 90 : input.expiresInDays,
    })
  return { user, password, agent, xsrf, response, token: response.body.token as string }
}

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` }
}

async function createGalleryAsAdmin(
  status: 'draft' | 'published' = 'published',
  displayName = '内容管理员'
) {
  const { user, password } = await createTestUser({ role: 'admin', displayName })
  const { agent, xsrf } = await loginAgent(user.email, password)
  const upload = await uploadTestAsset(agent, xsrf)
  const created = await agent
    .post('/api/admin/galleries')
    .set('X-XSRF-TOKEN', xsrf)
    .send({
      title: 'API 接入验收',
      description: '原有管理路由',
      status,
      assetIds: [upload.body.asset.id],
    })
  return { user, agent, xsrf, upload, created }
}

describe('个人 API 密钥管理', () => {
  it('要求 Cookie 会话与 CSRF，密钥只显示一次且只能由本人撤销', async () => {
    const { user, password } = await createTestUser()
    const { agent, xsrf } = await loginAgent(user.email, password)
    const missingXsrf = await agent.post('/api/me/api-keys').send({ name: '缺少 CSRF' })
    expect(missingXsrf.status).toBe(403)

    const created = await agent
      .post('/api/me/api-keys')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ name: '发布机器人', scope: 'read_write', expiresInDays: null })
    expect(created.status).toBe(201)
    expect(created.body.token).toMatch(/^qq_api_[A-Za-z0-9_-]{43}$/)
    expect(created.body.apiKey).toMatchObject({
      name: '发布机器人',
      scope: 'read_write',
      expiresAt: null,
      status: 'active',
    })
    expect(created.headers['cache-control']).toBe('no-store')
    expect(created.body.apiKey).not.toHaveProperty('tokenHash')
    expect(created.body.apiKey).not.toHaveProperty('sessionVersion')

    const listed = await agent.get('/api/me/api-keys')
    expect(listed.status).toBe(200)
    expect(listed.headers['cache-control']).toBe('no-store')
    expect(listed.body.items).toHaveLength(1)
    expect(listed.body.items[0]).not.toHaveProperty('token')

    const other = await createTestUser()
    const { agent: otherAgent, xsrf: otherXsrf } = await loginAgent(
      other.user.email,
      other.password
    )
    const foreignRevoke = await otherAgent
      .delete(`/api/me/api-keys/${created.body.apiKey.id}`)
      .set('X-XSRF-TOKEN', otherXsrf)
    expect((await otherAgent.get('/api/me/api-keys')).body.items).toEqual([])
    expect(foreignRevoke.status).toBe(404)

    const revoked = await agent
      .delete(`/api/me/api-keys/${created.body.apiKey.id}`)
      .set('X-XSRF-TOKEN', xsrf)
    expect(revoked.status).toBe(200)
    expect(revoked.body).toEqual({ success: true })
    const repeated = await agent
      .delete(`/api/me/api-keys/${created.body.apiKey.id}`)
      .set('X-XSRF-TOKEN', xsrf)
    expect(repeated.status).toBe(200)
    const afterRevoke = await agent.get('/api/me/api-keys')
    expect(afterRevoke.body.items[0].status).toBe('revoked')
    const unusable = await request(app).get('/api/galleries').set(bearer(created.body.token))
    expect(unusable.status).toBe(401)

    expect(await prisma.apiKey.count({ where: { userUid: user.uid } })).toBe(1)
  })

  it('只读密钥可读取公开内容和管理员草稿，但不能写入或提升普通用户权限', async () => {
    const published = await createGalleryAsAdmin('published', '发布者甲')
    const draft = await createGalleryAsAdmin('draft', '发布者乙')
    const reader = await issueKey('user', { scope: 'read' })
    const publicList = await request(app).get('/api/galleries/').set(bearer(reader.token))
    expect(publicList.status).toBe(200)
    expect(publicList.body.items.map((item: { id: string }) => item.id)).toContain(
      published.created.body.gallery.id
    )
    const hiddenDraft = await request(app)
      .get(`/api/galleries/${draft.created.body.gallery.id}`)
      .set(bearer(reader.token))
    expect(hiddenDraft.status).toBe(404)
    const keycap = await prisma.keycap.create({ data: { seq: 1, name: 'API 可读键帽' } })
    const keycaps = await request(app).get('/api/keycaps').set(bearer(reader.token))
    expect(keycaps.status).toBe(200)
    expect(keycaps.body.items.some((item: { id: string }) => item.id === keycap.id)).toBe(true)

    const readAdmin = await issueKey('admin', { scope: 'read' })
    const adminList = await request(app)
      .get('/api/admin/galleries?status=draft')
      .set(bearer(readAdmin.token))
    expect(adminList.status).toBe(200)
    expect(adminList.body.items.map((item: { id: string }) => item.id)).toContain(
      draft.created.body.gallery.id
    )
    const writeDenied = await request(app)
      .post('/api/admin/galleries')
      .set(bearer(readAdmin.token))
      .send({ title: '不可写', status: 'draft', assetIds: ['missing'] })
    expect(writeDenied.status).toBe(403)
    expect(writeDenied.body.code).toBe('API_KEY_SCOPE_FORBIDDEN')

    const regularWriter = await issueKey('user', { scope: 'read_write' })
    const roleDenied = await request(app)
      .post('/api/admin/galleries')
      .set(bearer(regularWriter.token))
      .send({ title: '不可越权', status: 'draft', assetIds: ['missing'] })
    expect(roleDenied.status).toBe(403)
    expect(await prisma.gallery.count({ where: { title: '不可越权' } })).toBe(0)
    expect(published.created.status).toBe(201)
  })

  it('管理员读写密钥可经原上传与图集接口创建草稿并发布', async () => {
    const { user, password } = await createTestUser({ role: 'admin' })
    const admin = await loginAgent(user.email, password)
    const createdKey = await admin.agent
      .post('/api/me/api-keys')
      .set('X-XSRF-TOKEN', admin.xsrf)
      .send({ name: '内容发布', scope: 'read_write', expiresInDays: 90 })
    expect(createdKey.status).toBe(201)
    const token = createdKey.body.token as string

    const missingFile = await request(app).post('/api/admin/uploads/images').set(bearer(token))
    expect(missingFile.status).toBe(400)
    const invalidFile = await request(app)
      .post('/api/admin/uploads/images')
      .set(bearer(token))
      .attach('file', Buffer.from('not an image'), {
        filename: 'invalid.txt',
        contentType: 'text/plain',
      })
    expect(invalidFile.status).toBe(400)
    const initialAssets = await prisma.mediaAsset.count()
    const regular = await issueKey('user', { scope: 'read_write' })
    const blockedUpload = await request(app)
      .post('/api/admin/uploads/images')
      .set(bearer(regular.token))
      .attach('file', await createTestImageBuffer(), {
        filename: 'blocked.png',
        contentType: 'image/png',
      })
    expect(blockedUpload.status).toBe(403)
    expect(await prisma.mediaAsset.count()).toBe(initialAssets)

    const uploaded = await request(app)
      .post('/api/admin/uploads/images')
      .set(bearer(token))
      .attach('file', await createTestImageBuffer(), {
        filename: 'api-image.png',
        contentType: 'image/png',
      })
    expect(uploaded.status).toBe(201)
    const gallery = await request(app)
      .post('/api/admin/galleries')
      .set(bearer(token))
      .send({
        title: 'Bearer 创建草稿',
        description: '由 API 建立',
        status: 'draft',
        assetIds: [uploaded.body.asset.id],
      })
    expect(gallery.status).toBe(201)
    expect(gallery.body.gallery.author.uid).toBe(user.uid)
    expect(gallery.body.gallery.status).toBe('draft')
    expect(gallery.body.gallery.images).toHaveLength(1)

    const draftPublic = await request(app).get(`/api/galleries/${gallery.body.gallery.id}`)
    expect(draftPublic.status).toBe(404)
    const publish = await request(app)
      .patch(`/api/admin/galleries/${gallery.body.gallery.id}`)
      .set(bearer(token))
      .send({ status: 'published', title: 'Bearer 已发布' })
    expect(publish.status).toBe(200)
    expect(publish.body.gallery.status).toBe('published')
    expect(publish.body.gallery.title).toBe('Bearer 已发布')

    const visible = await request(app).get(`/api/galleries/${gallery.body.gallery.id}`)
    expect(visible.status).toBe(200)
    const imagePath = new URL(visible.body.gallery.images[0].url, 'http://localhost').pathname
    const image = await request(app).get(imagePath)
    expect(image.status).toBe(200)
    expect(image.headers['content-type']).toContain('image/')
    const referencedDelete = await request(app)
      .delete(`/api/admin/uploads/${uploaded.body.asset.id}`)
      .set(bearer(token))
    expect(referencedDelete.status).toBe(200)
    expect(referencedDelete.body.success).toBe(false)
    expect((await request(app).get(imagePath)).status).toBe(200)

    const orphan = await request(app)
      .post('/api/admin/uploads/images')
      .set(bearer(token))
      .attach('file', await createTestImageBuffer(), {
        filename: 'orphan.png',
        contentType: 'image/png',
      })
    expect(orphan.status).toBe(201)
    const orphanPath = new URL(orphan.body.asset.url, 'http://localhost').pathname
    const cleanup = await request(app)
      .delete(`/api/admin/uploads/${orphan.body.asset.id}`)
      .set(bearer(token))
    expect(cleanup.body.success).toBe(true)
    expect((await request(app).get(orphanPath)).status).toBe(404)
    expect(image.body.length).toBeGreaterThan(0)
  })

  it('密钥不能访问白名单外接口、管理接口不可由普通用户调用', async () => {
    const { token } = await issueKey()
    const forbiddenRequests = [
      request(app).get('/api/me/api-keys'),
      request(app).get('/api/admin/users'),
      request(app).get('/api/admin/settings'),
      request(app).post('/api/auth/logout'),
      request(app).post('/api/admin/keycaps'),
      request(app).post('/api/galleries/some-id/like'),
      request(app).delete('/api/admin/galleries/some-id'),
      request(app).get('/api/galleries/some-id/extra'),
      request(app).get('/api/galleries/one%2Ftwo'),
      request(app).get('/api/galleries-extra'),
    ]
    for (const responsePromise of forbiddenRequests) {
      const response = await responsePromise.set(bearer(token))
      expect(response.status).toBe(403)
      expect(response.body.code).toBe('API_KEY_ENDPOINT_FORBIDDEN')
    }

    const { user, password } = await createTestUser({ role: 'super_admin' })
    const { agent: superAgent } = await loginAgent(user.email, password)
    const cookieAndBadToken = await superAgent
      .get('/api/galleries')
      .set('Authorization', 'Bearer invalid-token')
    expect(cookieAndBadToken.status).toBe(401)
    expect(cookieAndBadToken.headers['cache-control']).toBe('no-store')
    const duplicateHeaders = await request(app)
      .get('/api/galleries')
      .set('Authorization', [`Bearer ${token}`, `Bearer ${token}`] as unknown as string)
    expect(duplicateHeaders.status).toBe(401)
    const malformed = await request(app)
      .get('/api/galleries')
      .set('Authorization', `Bearer ${token}, Bearer ${token}`)
    expect(malformed.status).toBe(401)
    const wrongScheme = await request(app)
      .get('/api/galleries')
      .set('Authorization', `Basic ${token}`)
    expect(wrongScheme.status).toBe(401)
    const validUserKeyWithAdminCookie = await superAgent
      .get('/api/admin/galleries')
      .set(bearer(token))
    expect(validUserKeyWithAdminCookie.status).toBe(403)
    expect(validUserKeyWithAdminCookie.body.error).toBe('需要管理员权限')
    expect((await superAgent.get('/api/galleries')).status).toBe(200)
  })

  it('到期、改密、封禁與角色降级即时应用于密钥', async () => {
    const target = await issueKey('admin', { scope: 'read_write', expiresInDays: 30 })
    const keyId = target.response.body.apiKey.id as string
    const fixedNow = 1_900_000_000_000
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(fixedNow)
    let boundaryStatus = 0
    try {
      await prisma.apiKey.update({ where: { id: keyId }, data: { expiresAt: new Date(fixedNow) } })
      boundaryStatus = (await request(app).get('/api/galleries').set(bearer(target.token))).status
    } finally {
      nowSpy.mockRestore()
    }
    expect(boundaryStatus).toBe(401)
    await prisma.apiKey.update({ where: { id: keyId }, data: { expiresAt: new Date(0) } })
    expect((await request(app).get('/api/galleries').set(bearer(target.token))).status).toBe(401)
    const listedExpired = await target.agent.get('/api/me/api-keys')
    expect(listedExpired.body.items[0].status).toBe('expired')

    const passwordTarget = await issueKey('admin', { scope: 'read' })
    const { user: superAdmin, password: superPassword } = await createTestUser({
      role: 'super_admin',
    })
    const { agent: superAgent, xsrf } = await loginAgent(superAdmin.email, superPassword)
    const reset = await superAgent
      .post(`/api/admin/users/${passwordTarget.user.uid}/password`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ password: 'newAdminPass123' })
    expect(reset.status).toBe(200)
    expect(
      (await request(app).get('/api/galleries').set(bearer(passwordTarget.token))).status
    ).toBe(401)
    const refreshed = await loginAgent(passwordTarget.user.email, 'newAdminPass123')
    const invalidatedList = await refreshed.agent.get('/api/me/api-keys')
    expect(invalidatedList.body.items[0].status).toBe('invalidated')

    const live = await issueKey('admin', { scope: 'read_write' })
    const banned = await superAgent
      .patch(`/api/admin/users/${live.user.uid}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ status: 'banned', banReason: '测试封禁' })
    expect(banned.status).toBe(200)
    const bannedCall = await request(app).get('/api/galleries').set(bearer(live.token))
    expect(bannedCall.status).toBe(403)
    expect(bannedCall.body.code).toBe('USER_BANNED')

    const roleChanged = await issueKey('admin', { scope: 'read_write' })
    const demoted = await superAgent
      .patch(`/api/admin/users/${roleChanged.user.uid}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ role: 'user' })
    expect(demoted.status).toBe(200)
    const denied = await request(app)
      .post('/api/admin/galleries')
      .set(bearer(roleChanged.token))
      .send({ title: '降权后不可写', status: 'draft', assetIds: ['missing'] })
    expect(denied.status).toBe(403)
  })

  it('每个账户最多十把有效密钥，并发创建不能突破上限', async () => {
    const { user, agent, xsrf } = await issueKey()
    for (let index = 0; index < 8; index += 1) {
      const response = await agent
        .post('/api/me/api-keys')
        .set('X-XSRF-TOKEN', xsrf)
        .send({ name: `密钥${index}`, scope: 'read' })
      expect(response.status).toBe(201)
    }
    const concurrent = await Promise.all([
      agent.post('/api/me/api-keys').set('X-XSRF-TOKEN', xsrf).send({ name: '并发甲' }),
      agent.post('/api/me/api-keys').set('X-XSRF-TOKEN', xsrf).send({ name: '并发乙' }),
    ])
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409])
    expect(concurrent.find((response) => response.status === 409)?.body.code).toBe('API_KEY_LIMIT')

    const listed = await agent.get('/api/me/api-keys')
    const keyToRevoke = listed.body.items[0].id as string
    await agent.delete(`/api/me/api-keys/${keyToRevoke}`).set('X-XSRF-TOKEN', xsrf)
    const replacement = await agent
      .post('/api/me/api-keys')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ name: '替换密钥' })
    expect(replacement.status).toBe(201)
    expect(await prisma.apiKey.count({ where: { userUid: user.uid, revokedAt: null } })).toBe(10)
    expect(await prisma.apiKey.count({ where: { userUid: user.uid } })).toBe(11)
    const expiredKeyId = listed.body.items.find((key: { id: string }) => key.id !== keyToRevoke)?.id
    expect(expiredKeyId).toBeTruthy()
    await prisma.apiKey.update({ where: { id: expiredKeyId }, data: { expiresAt: new Date(0) } })
    const expiryReplacement = await agent
      .post('/api/me/api-keys')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ name: '过期后补位' })
    expect(expiryReplacement.status).toBe(201)
    expect(
      await prisma.apiKey.count({
        where: { userUid: user.uid, revokedAt: null, expiresAt: { gt: new Date() } },
      })
    ).toBe(10)
    expect(await prisma.apiKey.count({ where: { userUid: user.uid } })).toBe(12)
  })

  it('密码重置使达到上限的旧密钥失效并腾出创建额度', async () => {
    const target = await issueKey('user')
    for (let index = 0; index < 9; index += 1) {
      const response = await target.agent
        .post('/api/me/api-keys')
        .set('X-XSRF-TOKEN', target.xsrf)
        .send({ name: `旧凭证${index}` })
      expect(response.status).toBe(201)
    }

    const { user: superAdmin, password } = await createTestUser({ role: 'super_admin' })
    const { agent, xsrf } = await loginAgent(superAdmin.email, password)
    const reset = await agent
      .post(`/api/admin/users/${target.user.uid}/password`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ password: 'newFanPass2026' })
    expect(reset.status).toBe(200)

    const renewedSession = await loginAgent(target.user.email, 'newFanPass2026')
    const invalidatedKeys = await renewedSession.agent.get('/api/me/api-keys')
    expect(invalidatedKeys.body.items).toHaveLength(10)
    expect(
      invalidatedKeys.body.items.every((key: { status: string }) => key.status === 'invalidated')
    ).toBe(true)
    const replacement = await renewedSession.agent
      .post('/api/me/api-keys')
      .set('X-XSRF-TOKEN', renewedSession.xsrf)
      .send({ name: '重置后凭证' })
    expect(replacement.status).toBe(201)
  })

  it('删除账户后级联使关联 API 密钥立即失效', async () => {
    const { user, token } = await issueKey()
    await prisma.user.delete({ where: { uid: user.uid } })
    const response = await request(app).get('/api/galleries').set(bearer(token))
    expect(response.status).toBe(401)
    expect(response.body.code).toBe('API_KEY_INVALID')
  })

  it('封禁账户解除后仍可使用未撤销且未过期的密钥', async () => {
    const live = await issueKey('user')
    const { user: superAdmin, password } = await createTestUser({ role: 'super_admin' })
    const { agent, xsrf } = await loginAgent(superAdmin.email, password)
    const ban = await agent
      .patch(`/api/admin/users/${live.user.uid}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ status: 'banned' })
    expect(ban.status).toBe(200)
    expect((await request(app).get('/api/galleries').set(bearer(live.token))).status).toBe(403)
    const unban = await agent
      .patch(`/api/admin/users/${live.user.uid}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ status: 'active' })
    expect(unban.status).toBe(200)
    expect((await request(app).get('/api/galleries').set(bearer(live.token))).status).toBe(200)
  })

  it('仅 Cookie 认证行为保持原样，API 密钥写入无需 CSRF', async () => {
    const admin = await createGalleryAsAdmin('published', '常规会话管理员')
    const cookieRead = await admin.agent.get('/api/galleries')
    expect(cookieRead.status).toBe(200)
    const cookieWriteWithoutXsrf = await admin.agent
      .patch(`/api/admin/galleries/${admin.created.body.gallery.id}`)
      .send({ title: '缺少 CSRF' })
    expect(cookieWriteWithoutXsrf.status).toBe(403)

    const { token } = await issueKey('admin', { scope: 'read_write' })
    const apiList = await request(app).get('/api/galleries').set(bearer(token))
    expect(apiList.status).toBe(200)
    expect(apiList.headers['cache-control']).toBe('no-store')
  })
})
