import fs from 'fs/promises'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createTestImageBuffer,
  createTestUser,
  loginAgent,
  prisma,
  resetDatabase,
  seedSiteConfig,
  uploadTestAsset,
} from './setup'
import { getUploadsDir } from '../../src/server/utils/uploadsPath'
import { UPLOAD_MAX_FILE_SIZE_BYTES } from '../../src/server/services/image.service'

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})

async function loginAsAdmin() {
  const { user, password } = await createTestUser({ role: 'admin', displayName: '清浅' })
  const { agent, xsrf } = await loginAgent(user.email, password)
  return { agent, xsrf, admin: user }
}

describe('图片上传', () => {
  it('上传图片生成三档产物并落库', async () => {
    const { agent, xsrf } = await loginAsAdmin()

    const response = await uploadTestAsset(agent, xsrf)

    expect(response.status).toBe(201)
    const asset = response.body.asset
    expect(asset.url).toMatch(/^\/uploads\/images\/\d{4}\/\d{2}\/.+_o\.png$/)
    expect(asset.displayUrl).toContain('_d.webp')
    expect(asset.thumbUrl).toContain('_t.webp')
    expect(asset.width).toBe(40)
    expect(asset.height).toBe(30)
    expect(asset.blurhash).toBeTruthy()

    const stored = await prisma.mediaAsset.findUnique({ where: { id: asset.id } })
    expect(stored?.storageKey).toBe(asset.url.replace('/uploads/', ''))
    await expect(fs.access(path.join(getUploadsDir(), stored!.storageKey))).resolves.toBeUndefined()
  })

  it('非管理员上传返回 403', async () => {
    const { user, password } = await createTestUser({ displayName: '小粉丝' })
    const { agent, xsrf } = await loginAgent(user.email, password)

    const response = await uploadTestAsset(agent, xsrf)

    expect(response.status).toBe(403)
  })

  it('伪装的非图片文件返回 400', async () => {
    const { agent, xsrf } = await loginAsAdmin()

    const response = await uploadTestAsset(agent, xsrf, {
      buffer: Buffer.from('not an image at all'),
      filename: 'fake.png',
      contentType: 'image/png',
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toBe('无法解析的图片文件')
  })

  it('扩展名不在白名单的文件返回 400', async () => {
    const { agent, xsrf } = await loginAsAdmin()

    const response = await uploadTestAsset(agent, xsrf, {
      buffer: await createTestImageBuffer(),
      filename: 'photo.bmp2',
      contentType: 'image/bmp',
    })

    expect(response.status).toBe(400)
    expect(response.body.error).toContain('仅支持')
  })

  it('超过配置上限的文件返回 413', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const oversized = Buffer.alloc(UPLOAD_MAX_FILE_SIZE_BYTES + 1, 1)

    const response = await uploadTestAsset(agent, xsrf, {
      buffer: oversized,
      filename: 'huge.png',
      contentType: 'image/png',
    })

    expect(response.status).toBe(413)
  })
})

describe('资产回滚与清理', () => {
  it('已引用的资产不会被删除', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const upload = await uploadTestAsset(agent, xsrf)
    const assetId = upload.body.asset.id as string

    await agent
      .post('/api/admin/keycaps')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ name: '山海', assetIds: [assetId] })

    const response = await agent.delete(`/api/admin/uploads/${assetId}`).set('X-XSRF-TOKEN', xsrf)

    expect(response.body.success).toBe(false)
    expect(await prisma.mediaAsset.count({ where: { id: assetId } })).toBe(1)
  })

  it('未引用且超过保留期的资产会被批量清理', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const upload = await uploadTestAsset(agent, xsrf)
    const assetId = upload.body.asset.id as string

    // 回拨创建时间，模拟「上传后未保存」的历史孤儿文件
    await prisma.mediaAsset.update({
      where: { id: assetId },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    })

    const purge = await agent
      .post('/api/admin/maintenance/purge-orphan-assets')
      .set('X-XSRF-TOKEN', xsrf)

    expect(purge.status).toBe(200)
    expect(purge.body.deleted).toBe(1)
    expect(await prisma.mediaAsset.count({ where: { id: assetId } })).toBe(0)
  })

  it('未保存的新资产可立即回滚删除', async () => {
    const { agent, xsrf } = await loginAsAdmin()
    const upload = await uploadTestAsset(agent, xsrf)
    const assetId = upload.body.asset.id as string

    const response = await agent.delete(`/api/admin/uploads/${assetId}`).set('X-XSRF-TOKEN', xsrf)

    expect(response.body.success).toBe(true)
    expect(await prisma.mediaAsset.count({ where: { id: assetId } })).toBe(0)
  })
})
