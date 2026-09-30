import { beforeEach, describe, expect, it } from 'vitest'

import {
  createAnonymousAgent,
  createTestUser,
  loginAgent,
  prisma,
  resetDatabase,
  seedSiteConfig,
  uploadTestAsset,
} from './setup'

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})

async function loginAsAdmin() {
  const { user, password } = await createTestUser({ role: 'admin', displayName: '清浅' })
  const { agent, xsrf } = await loginAgent(user.email, password)
  return { agent, xsrf, admin: user }
}

async function createKeycap(
  agent: ReturnType<typeof createAnonymousAgent>,
  xsrf: string,
  payload: { name: string; description?: string; seq?: number; assetIds: string[] }
) {
  return agent.post('/api/admin/keycaps').set('X-XSRF-TOKEN', xsrf).send(payload)
}

describe('键帽管理', () => {
  it('未指定序号时自动取 max+1', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const asset = await uploadTestAsset(agent, xsrf)
    const assetId = asset.body.asset.id as string

    await createKeycap(agent, xsrf, { name: '山海', assetIds: [assetId], seq: 3 })

    const response = await createKeycap(agent, xsrf, {
      name: '暗夜',
      description: '第二团',
      assetIds: [assetId],
    })

    expect(response.status).toBe(201)
    expect(response.body.keycap.seq).toBe(4)
  })

  it('前后台列表及仪表盘按序号降序，并返回下一个可用序号', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const asset = await uploadTestAsset(agent, xsrf)
    const assetId = asset.body.asset.id as string

    await createKeycap(agent, xsrf, { name: '暗夜', assetIds: [assetId], seq: 2 })
    await createKeycap(agent, xsrf, { name: '山海', assetIds: [assetId], seq: 1 })

    const list = await createAnonymousAgent().get('/api/keycaps')
    expect(list.body.items.map((item: { seq: number }) => item.seq)).toEqual([2, 1])

    const adminList = await agent.get('/api/admin/keycaps?page=1&pageSize=20')
    expect(adminList.body.items.map((item: { seq: number }) => item.seq)).toEqual([2, 1])
    expect(adminList.body.nextSeq).toBe(3)

    const stats = await agent.get('/api/admin/stats')
    expect(stats.body.latestKeycaps.map((item: { seq: number }) => item.seq)).toEqual([2, 1])
  })

  it('序号冲突返回 409', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const asset = await uploadTestAsset(agent, xsrf)
    const assetId = asset.body.asset.id as string

    await createKeycap(agent, xsrf, { name: '山海', assetIds: [assetId], seq: 1 })
    const conflict = await createKeycap(agent, xsrf, { name: '重号', assetIds: [assetId], seq: 1 })

    expect(conflict.status).toBe(409)
    expect(conflict.body.error).toBe('该序号已被占用')
  })

  it('详情包含序号、描述与图片', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const asset = await uploadTestAsset(agent, xsrf)
    const assetId = asset.body.asset.id as string

    const created = await createKeycap(agent, xsrf, {
      name: '山海',
      description: '山水配色',
      assetIds: [assetId],
    })

    const detail = await createAnonymousAgent().get(`/api/keycaps/${created.body.keycap.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.keycap.seq).toBe(1)
    expect(detail.body.keycap.description).toBe('山水配色')
    expect(detail.body.keycap.images).toHaveLength(1)
  })

  it('更新名称、描述与图片顺序', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const first = await uploadTestAsset(agent, xsrf)
    const second = await uploadTestAsset(agent, xsrf)

    const created = await createKeycap(agent, xsrf, {
      name: '山海',
      assetIds: [first.body.asset.id, second.body.asset.id],
    })
    const detail = await agent.get(`/api/admin/keycaps/${created.body.keycap.id}`)

    const updated = await agent
      .patch(`/api/admin/keycaps/${created.body.keycap.id}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({
        name: '山海·复刻',
        description: '复刻团',
        assetIds: detail.body.keycap.images
          .map((image: { assetId: string }) => image.assetId)
          .reverse(),
      })

    expect(updated.status).toBe(200)
    expect(updated.body.keycap.name).toBe('山海·复刻')

    const saved = await agent.get(`/api/admin/keycaps/${created.body.keycap.id}`)
    expect(saved.body.keycap.images.map((image: { assetId: string }) => image.assetId)).toEqual([
      second.body.asset.id,
      first.body.asset.id,
    ])
    expect(saved.body.keycap.images[0].thumbUrl).toBe(second.body.asset.thumbUrl)
  })

  it('删除键帽后清理未被引用的图片资产', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const asset = await uploadTestAsset(agent, xsrf)
    const assetId = asset.body.asset.id as string

    const created = await createKeycap(agent, xsrf, { name: '山海', assetIds: [assetId] })
    const removed = await agent
      .delete(`/api/admin/keycaps/${created.body.keycap.id}`)
      .set('X-XSRF-TOKEN', xsrf)

    expect(removed.status).toBe(200)
    expect(await prisma.keycap.count()).toBe(0)

    const assetResponse = await agent
      .delete(`/api/admin/uploads/${assetId}`)
      .set('X-XSRF-TOKEN', xsrf)
    expect(assetResponse.body.success).toBe(false)
  })

  it('普通用户不能创建键帽', async () => {
    const { user, password } = await createTestUser({ displayName: '小粉丝' })
    const { agent, xsrf } = await loginAgent(user.email, password)

    const response = await agent
      .post('/api/admin/keycaps')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ name: '越权键帽', assetIds: ['not-exist'] })

    expect(response.status).toBe(403)
  })
})
