import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireAdmin } from '../middleware/auth'
import { purgeOrphanAssets } from '../services/media.service'
import { logger } from '../utils/logger'

const router = Router()

// 清理「上传后未保存」的孤儿图片（含文件）
router.post(
  '/purge-orphan-assets',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const deleted = await purgeOrphanAssets()
    logger.info({ deleted }, 'Purged orphan media assets')
    res.json({ deleted })
  })
)

export function registerAdminMaintenanceRoutes(app: Router) {
  app.use('/api/admin/maintenance', router)
}
