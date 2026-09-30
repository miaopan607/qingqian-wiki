import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireActiveUser } from '../middleware/auth'
import { writeLimiter } from '../middleware/rateLimit'
import type { AuthenticatedRequest } from '../types'
import { AppError } from '../utils/appError'
import { readParam } from '../utils/routeParams'
import { createApiKey, listApiKeys, revokeApiKey } from '../services/apiKey.service'
import { createApiKeySchema, validateBody } from '../schemas'

const router = Router()

router.use(requireActiveUser)

router.get(
  '/',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (req.authMethod !== 'cookie' || !req.authSessionVersion) {
      throw new AppError('需要使用登录会话管理 API 密钥', 403)
    }
    res.setHeader('Cache-Control', 'no-store')
    res.json({ items: await listApiKeys(req.authUser!.uid, req.authSessionVersion) })
  })
)

router.post(
  '/',
  writeLimiter,
  validateBody(createApiKeySchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (req.authMethod !== 'cookie') throw new AppError('需要使用登录会话管理 API 密钥', 403)
    res.setHeader('Cache-Control', 'no-store')
    const body = req.body as {
      name: string
      scope: 'read' | 'read_write'
      expiresInDays: 30 | 90 | 365 | null
    }
    res.status(201).json(await createApiKey(req.authUser!.uid, body))
  })
)

router.delete(
  '/:id',
  writeLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (req.authMethod !== 'cookie') throw new AppError('需要使用登录会话管理 API 密钥', 403)
    await revokeApiKey(req.authUser!.uid, readParam(req.params.id))
    res.setHeader('Cache-Control', 'no-store')
    res.json({ success: true })
  })
)

export function registerApiKeyRoutes(app: Router) {
  app.use('/api/me/api-keys', router)
}
