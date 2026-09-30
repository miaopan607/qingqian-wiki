import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireSuperAdmin } from '../middleware/auth'
import { siteSettingsSchema, validateBody } from '../schemas'
import {
  getSiteSettings,
  updateSiteSettings,
  type SiteSettings,
} from '../services/siteConfig.service'
import { isS3Configured } from '../services/storage'
import { getUploadsDir } from '../utils/uploadsPath'

const router = Router()

function buildSettingsPayload(settings: SiteSettings) {
  return {
    settings,
    capabilities: {
      s3Configured: isS3Configured(),
      uploadsDir: getUploadsDir(),
      storageDriver: settings.storageDriver,
    },
  }
}

router.get(
  '/',
  requireSuperAdmin,
  asyncHandler(async (_req, res) => {
    res.json(buildSettingsPayload(await getSiteSettings()))
  })
)

router.patch(
  '/',
  requireSuperAdmin,
  validateBody(siteSettingsSchema),
  asyncHandler(async (req, res) => {
    const settings = await updateSiteSettings(req.body)
    res.json(buildSettingsPayload(settings))
  })
)

export function registerAdminSettingsRoutes(app: Router) {
  app.use('/api/admin/settings', router)
}
