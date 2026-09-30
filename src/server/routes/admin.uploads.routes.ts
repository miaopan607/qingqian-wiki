import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireAdmin } from '../middleware/auth'
import { uploadLimiter } from '../middleware/rateLimit'
import { imageUpload } from '../middleware/upload'
import { processGalleryImage } from '../services/image.service'
import { createAsset, deleteAssetById, toAssetResponse } from '../services/media.service'
import { getSiteSettings } from '../services/siteConfig.service'
import type { AuthenticatedRequest } from '../types'
import { readParam } from '../utils/routeParams'

const router = Router()

// 图集/键帽图片上传：原图 + 详情图 + 缩略图三档产物
router.post(
  '/images',
  requireAdmin,
  uploadLimiter,
  imageUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: '请选择图片' })
      return
    }

    const settings = await getSiteSettings()
    const assetId = crypto.randomUUID()
    const processed = await processGalleryImage(file.buffer, assetId, settings.storageDriver)
    const asset = await createAsset({
      id: assetId,
      ownerUid: req.authUser!.uid,
      kind: 'image',
      driverId: settings.storageDriver,
      processed,
    })

    res.status(201).json({ asset: toAssetResponse(asset) })
  })
)

// 回滚「已上传但未保存」的图片；仍被引用时不删除
router.delete(
  '/:assetId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const deleted = await deleteAssetById(readParam(req.params.assetId))
    res.json({ success: deleted })
  })
)

export function registerAdminUploadRoutes(app: Router) {
  app.use('/api/admin/uploads', router)
}
