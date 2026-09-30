import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { UPLOAD_MAX_FILE_SIZE_MB } from '../services/image.service'
import { getSiteSettings } from '../services/siteConfig.service'

const router = Router()

// 前台启动时读取站点信息与上传限制
router.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const settings = await getSiteSettings()
    res.json({
      name: settings.name,
      registrationOpen: settings.registrationOpen,
      uploadMaxFileSizeMB: UPLOAD_MAX_FILE_SIZE_MB,
    })
  })
)

export function registerConfigRoutes(app: Router) {
  app.use('/api/config', router)
}
