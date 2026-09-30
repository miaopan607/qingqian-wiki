import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { getSiteSettings } from '../services/siteConfig.service'

const router = Router()

// 前台启动时读取：站点名称、简介与注册开关
router.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const settings = await getSiteSettings()
    res.json({
      name: settings.name,
      registrationOpen: settings.registrationOpen,
    })
  })
)

export function registerConfigRoutes(app: Router) {
  app.use('/api/config', router)
}
