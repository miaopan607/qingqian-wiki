import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { clearAuthCookie, issueUserSession, toApiUser, USER_SELECT } from '../middleware/auth'
import { authLimiter } from '../middleware/rateLimit'
import { prisma } from '../prisma'
import { loginSchema, registerSchema, validateBody } from '../schemas'
import { getSiteSettings } from '../services/siteConfig.service'
import type { AuthenticatedRequest } from '../types'
import { logger } from '../utils/logger'
import { getPasswordSaltRounds } from '../utils/password'

const router = Router()

router.get(
  '/me',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.json({ user: req.authUser ?? null })
  })
)

router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { email, password, displayName } = req.body as {
      email: string
      password: string
      displayName: string
    }
    const normalizedEmail = email.toLowerCase()

    const settings = await getSiteSettings()
    if (!settings.registrationOpen) {
      res.status(403).json({ error: '当前已关闭注册', code: 'REGISTRATION_CLOSED' })
      return
    }

    const passwordHash = await bcrypt.hash(password, getPasswordSaltRounds())

    try {
      const user = await prisma.user.create({
        data: { email: normalizedEmail, displayName, passwordHash, role: 'user' },
        select: USER_SELECT,
      })

      issueUserSession(req, res, user)
      logger.info({ uid: user.uid }, 'User registered')
      res.status(201).json({ user: toApiUser(user) })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '')
        res.status(409).json({
          error: target.includes('displayName') ? '该昵称已被使用' : '该邮箱已注册',
        })
        return
      }
      throw error
    }
  })
)

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string }
    const normalizedEmail = email.toLowerCase()

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: USER_SELECT,
    })

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      logger.info({ email: normalizedEmail }, 'Login failed')
      res.status(401).json({ error: '邮箱或密码错误' })
      return
    }

    if (user.status === 'banned') {
      res.status(403).json({ error: '账号已被封禁', code: 'USER_BANNED' })
      return
    }

    issueUserSession(req, res, user)
    logger.info({ uid: user.uid }, 'Login success')
    res.json({ user: toApiUser(user) })
  })
)

router.post('/logout', (req, res) => {
  clearAuthCookie(res)
  res.json({ success: true })
})

export function registerAuthRoutes(app: Router) {
  app.use('/api/auth', router)
}
