import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { issueUserSession, USER_SELECT, toApiUser } from '../middleware/auth'
import { authLimiter } from '../middleware/rateLimit'
import { prisma } from '../prisma'
import { setupInitializeSchema, validateBody } from '../schemas'
import { logger } from '../utils/logger'
import { getPasswordSaltRounds } from '../utils/password'

const router = Router()

const SETUP_ALREADY_INITIALIZED_MESSAGE = '系统已完成初始化，请登录'

async function countUsers(): Promise<number> {
  return prisma.user.count()
}

router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const initialized = (await countUsers()) > 0
    res.json({ initialized, requiresSetup: !initialized })
  })
)

// 空库首次初始化：创建超级管理员并直接登录
router.post(
  '/initialize',
  authLimiter,
  validateBody(setupInitializeSchema),
  asyncHandler(async (req, res) => {
    const { email, displayName, password } = req.body as {
      email: string
      displayName: string
      password: string
    }

    const passwordHash = await bcrypt.hash(password, getPasswordSaltRounds())

    try {
      const user = await prisma.$transaction(
        async (tx) => {
          const existingCount = await tx.user.count()
          if (existingCount > 0) return null

          return tx.user.create({
            data: {
              email: email.toLowerCase(),
              displayName,
              passwordHash,
              role: 'super_admin',
            },
            select: USER_SELECT,
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )

      if (!user) {
        res.status(409).json({ error: SETUP_ALREADY_INITIALIZED_MESSAGE })
        return
      }

      issueUserSession(req, res, user)
      logger.info({ uid: user.uid }, 'Initial super admin created')
      res.status(201).json({ user: toApiUser(user) })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        res.status(409).json({ error: SETUP_ALREADY_INITIALIZED_MESSAGE })
        return
      }
      throw error
    }
  })
)

export function registerSetupRoutes(app: Router) {
  app.use('/api/setup', router)
}
