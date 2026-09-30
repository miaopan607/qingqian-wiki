import { Prisma } from '@prisma/client'
import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireActiveUser, toApiUser, USER_SELECT } from '../middleware/auth'
import { imageUpload } from '../middleware/upload'
import { writeLimiter } from '../middleware/rateLimit'
import { prisma } from '../prisma'
import { publicListQuerySchema, updateProfileSchema, validateBody, validateQuery } from '../schemas'
import { processAvatarImage } from '../services/image.service'
import { createAsset, deleteAssetsIfUnreferenced, toAssetResponse } from '../services/media.service'
import { getSiteSettings } from '../services/siteConfig.service'
import { loadGalleryInteractions } from '../services/interaction.service'
import type { AuthenticatedRequest } from '../types'
import {
  GALLERY_LIST_INCLUDE,
  toGalleryListItem,
  toUserResponse,
} from '../utils/responseTransformers'
const router = Router()

router.get(
  '/favorites',
  requireActiveUser,
  validateQuery(publicListQuerySchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.authUser!
    const { page, pageSize } = req.query as unknown as { page: number; pageSize: number }

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where: { userUid: user.uid },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { gallery: { include: GALLERY_LIST_INCLUDE } },
      }),
      prisma.favorite.count({ where: { userUid: user.uid } }),
    ])

    const interactions = await loadGalleryInteractions(
      user.uid,
      favorites.map((favorite) => favorite.galleryId)
    )

    res.json({
      items: favorites.map((favorite) =>
        toGalleryListItem(favorite.gallery, {
          liked: interactions.get(favorite.galleryId)?.liked ?? false,
          favorited: true,
        })
      ),
      total,
      page,
      pageSize,
    })
  })
)

router.patch(
  '/',
  requireActiveUser,
  writeLimiter,
  validateBody(updateProfileSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.authUser!
    const { displayName, bio } = req.body as { displayName?: string; bio?: string }

    try {
      const updated = await prisma.user.update({
        where: { uid: user.uid },
        data: {
          ...(displayName === undefined ? {} : { displayName }),
          ...(bio === undefined ? {} : { bio }),
        },
        select: USER_SELECT,
      })
      res.json({ user: toApiUser(updated) })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({ error: '该昵称已被使用' })
        return
      }
      throw error
    }
  })
)

router.post(
  '/avatar',
  requireActiveUser,
  writeLimiter,
  imageUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.authUser!
    const file = req.file
    if (!file) {
      res.status(400).json({ error: '请选择图片' })
      return
    }

    const settings = await getSiteSettings()
    const previousAvatarAssetId = await prisma.user
      .findUnique({ where: { uid: user.uid }, select: { avatarAssetId: true } })
      .then((row) => row?.avatarAssetId ?? null)

    const assetId = crypto.randomUUID()
    const processed = await processAvatarImage(file.buffer, assetId, settings.storageDriver)
    const asset = await createAsset({
      id: assetId,
      ownerUid: user.uid,
      kind: 'avatar',
      driverId: settings.storageDriver,
      processed,
    })

    const updated = await prisma.user.update({
      where: { uid: user.uid },
      data: { avatarAssetId: asset.id },
      select: USER_SELECT,
    })

    if (previousAvatarAssetId) {
      await deleteAssetsIfUnreferenced([previousAvatarAssetId])
    }

    res.status(201).json({ user: toApiUser(updated), asset: toAssetResponse(asset) })
  })
)

router.delete(
  '/avatar',
  requireActiveUser,
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = req.authUser!
    const previousAvatarAssetId = await prisma.user
      .findUnique({ where: { uid: user.uid }, select: { avatarAssetId: true } })
      .then((row) => row?.avatarAssetId ?? null)

    const updated = await prisma.user.update({
      where: { uid: user.uid },
      data: { avatarAssetId: null },
      select: USER_SELECT,
    })

    if (previousAvatarAssetId) {
      await deleteAssetsIfUnreferenced([previousAvatarAssetId])
    }

    res.json({ user: toApiUser(updated) })
  })
)

// 个人中心顶部展示的完整资料（含注册时间）
router.get(
  '/',
  requireActiveUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { uid: req.authUser!.uid },
      select: USER_SELECT,
    })
    if (!user) {
      res.status(404).json({ error: '用户不存在' })
      return
    }
    res.json({ user: toUserResponse(user) })
  })
)

export function registerMeRoutes(app: Router) {
  app.use('/api/me', router)
}
