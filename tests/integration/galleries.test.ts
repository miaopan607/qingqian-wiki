import { beforeEach, describe, expect, it } from 'vitest'

import {
  createAnonymousAgent,
  createTestUser,
  loginAgent,
  resetDatabase,
  seedSiteConfig,
  uploadTestAsset,
} from './setup'

beforeEach(async () => {
  await resetDatabase()
  await seedSiteConfig()
})

async function createGalleryAsAdmin(options?: { status?: 'draft' | 'published' }) {
  const { user: admin, password } = await createTestUser({ role: 'admin', displayName: '清浅' })
  const { agent, xsrf } = await loginAgent(admin.email, password)

  const upload = await uploadTestAsset(agent, xsrf)
  const assetId = upload.body.asset.id as string

  const created = await agent
    .post('/api/admin/galleries')
    .set('X-XSRF-TOKEN', xsrf)
    .send({
      title: '清浅写真',
      description: '棚拍一组',
      status: options?.status ?? 'published',
      assetIds: [assetId],
    })

  return { agent, xsrf, admin, created, assetId }
}

describe('图集管理', () => {
  it('管理员创建图集并出现在公开列表', async () => {
    const { created } = await createGalleryAsAdmin()

    expect(created.status).toBe(201)
    expect(created.body.gallery.images).toHaveLength(1)
    expect(created.body.gallery.publishedAt).toBeTruthy()

    const list = await createAnonymousAgent().get('/api/galleries?page=1&pageSize=24')
    expect(list.status).toBe(200)
    expect(list.body.total).toBe(1)
    expect(list.body.items[0].title).toBe('清浅写真')
    expect(list.body.items[0].cover.thumbUrl).toContain('/uploads/')
    expect(list.body.items[0].imagesCount).toBe(1)
  })

  it('序号默认递增，支持修改，全部列表按序号降序且拒绝重号', async () => {
    const { agent, xsrf, created, assetId } = await createGalleryAsAdmin()
    expect(created.body.gallery.seq).toBe(1)
    const second = await agent
      .post('/api/admin/galleries')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ title: '第二组', assetIds: [assetId] })
    expect(second.status).toBe(201)
    expect(second.body.gallery.seq).toBe(2)

    const changed = await agent
      .patch(`/api/admin/galleries/${created.body.gallery.id}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ seq: 5 })
    expect(changed.status).toBe(200)
    expect(changed.body.gallery.seq).toBe(5)
    const conflict = await agent
      .patch(`/api/admin/galleries/${second.body.gallery.id}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ seq: 5 })
    expect(conflict.status).toBe(409)
    const duplicate = await agent
      .post('/api/admin/galleries')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ seq: 5, title: '重号', assetIds: [assetId] })
    expect(duplicate.status).toBe(409)

    const list = await createAnonymousAgent().get('/api/galleries?page=1&pageSize=1')
    expect(list.body.items.map((item: { seq: number }) => item.seq)).toEqual([5])
    const nextPage = await createAnonymousAgent().get('/api/galleries?page=2&pageSize=1')
    expect(nextPage.body.items.map((item: { seq: number }) => item.seq)).toEqual([2])
    const adminList = await agent.get('/api/admin/galleries')
    expect(adminList.body.items.map((item: { seq: number }) => item.seq)).toEqual([5, 2])
    expect(adminList.body.nextSeq).toBe(6)
    const stats = await agent.get('/api/admin/stats')
    expect(stats.body.latestGalleries.map((item: { seq: number }) => item.seq)).toEqual([5, 2])

    for (const id of [created.body.gallery.id, second.body.gallery.id]) {
      await agent.post(`/api/galleries/${id}/favorite`).set('X-XSRF-TOKEN', xsrf)
    }
    const favorites = await agent.get('/api/me/favorites')
    expect(favorites.body.items.map((item: { seq: number }) => item.seq)).toEqual([5, 2])
  })

  it('详情返回全部图片与互动状态', async () => {
    const { created } = await createGalleryAsAdmin()
    const galleryId = created.body.gallery.id

    const detail = await createAnonymousAgent().get(`/api/galleries/${galleryId}`)

    expect(detail.status).toBe(200)
    expect(detail.body.gallery.images).toHaveLength(1)
    expect(detail.body.gallery.liked).toBe(false)
    expect(detail.body.gallery.author.displayName).toBe('清浅')
  })

  it('草稿对匿名访问返回 404，对管理员可见', async () => {
    const { agent, created } = await createGalleryAsAdmin({ status: 'draft' })
    const galleryId = created.body.gallery.id

    const anonymous = await createAnonymousAgent().get(`/api/galleries/${galleryId}`)
    expect(anonymous.status).toBe(404)

    const asAdmin = await agent.get(`/api/galleries/${galleryId}`)
    expect(asAdmin.status).toBe(200)
  })

  it('普通用户不能创建图集', async () => {
    const { user, password } = await createTestUser({ displayName: '小粉丝' })
    const { agent, xsrf } = await loginAgent(user.email, password)

    const response = await agent
      .post('/api/admin/galleries')
      .set('X-XSRF-TOKEN', xsrf)
      .send({ title: '越权图集', status: 'published', assetIds: ['not-exist'] })

    expect(response.status).toBe(403)
  })

  it('未登录不能点赞，登录后可切换点赞与收藏', async () => {
    const { created } = await createGalleryAsAdmin()
    const galleryId = created.body.gallery.id

    const anonymous = await createAnonymousAgent().post(`/api/galleries/${galleryId}/like`)
    expect(anonymous.status).toBe(401)

    const { user, password } = await createTestUser({ displayName: '小粉丝' })
    const { agent, xsrf } = await loginAgent(user.email, password)

    const like = await agent.post(`/api/galleries/${galleryId}/like`).set('X-XSRF-TOKEN', xsrf)
    expect(like.body).toEqual({ liked: true, likesCount: 1 })

    const unlike = await agent.post(`/api/galleries/${galleryId}/like`).set('X-XSRF-TOKEN', xsrf)
    expect(unlike.body).toEqual({ liked: false, likesCount: 0 })

    const favorite = await agent
      .post(`/api/galleries/${galleryId}/favorite`)
      .set('X-XSRF-TOKEN', xsrf)
    expect(favorite.body).toEqual({ favorited: true, favoritesCount: 1 })

    const favorites = await agent.get('/api/me/favorites')
    expect(favorites.body.total).toBe(1)
    expect(favorites.body.items[0].favorited).toBe(true)
  })
})

describe('图集编辑与删除', () => {
  it('更新标题、图片顺序与状态', async () => {
    const { agent, xsrf, created, assetId } = await createGalleryAsAdmin()
    const galleryId = created.body.gallery.id

    const secondUpload = await uploadTestAsset(agent, xsrf)
    const secondAssetId = secondUpload.body.asset.id as string

    const updated = await agent
      .patch(`/api/admin/galleries/${galleryId}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({ title: '清浅写真（精选）', assetIds: [secondAssetId, assetId] })

    expect(updated.status).toBe(200)
    expect(updated.body.gallery.title).toBe('清浅写真（精选）')
    expect(updated.body.gallery.images).toHaveLength(2)
    expect(updated.body.gallery.images[0].thumbUrl).toBe(secondUpload.body.asset.thumbUrl)

    // 重新加载后用响应中的资产 ID 排序，覆盖已有图片编辑路径
    const detail = await agent.get(`/api/admin/galleries/${galleryId}`)
    const reordered = await agent
      .patch(`/api/admin/galleries/${galleryId}`)
      .set('X-XSRF-TOKEN', xsrf)
      .send({
        assetIds: detail.body.gallery.images
          .map((image: { assetId: string }) => image.assetId)
          .reverse(),
      })
    expect(reordered.status).toBe(200)

    const saved = await agent.get(`/api/admin/galleries/${galleryId}`)
    expect(saved.body.gallery.images.map((image: { assetId: string }) => image.assetId)).toEqual([
      assetId,
      secondAssetId,
    ])
    expect(saved.body.gallery.images[0].thumbUrl).toBe(created.body.gallery.images[0].thumbUrl)
  })

  it('删除图集后清理未被引用的图片资产', async () => {
    const { agent, xsrf, created, assetId } = await createGalleryAsAdmin()
    const galleryId = created.body.gallery.id

    const removed = await agent
      .delete(`/api/admin/galleries/${galleryId}`)
      .set('X-XSRF-TOKEN', xsrf)
    expect(removed.status).toBe(200)

    const list = await createAnonymousAgent().get('/api/galleries')
    expect(list.body.total).toBe(0)

    // 资产已随图集删除清理，再次删除应返回 false
    const assetResponse = await agent
      .delete(`/api/admin/uploads/${assetId}`)
      .set('X-XSRF-TOKEN', xsrf)
    expect(assetResponse.body.success).toBe(false)
  })
})
