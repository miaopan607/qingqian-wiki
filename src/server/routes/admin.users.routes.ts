import bcrypt from 'bcryptjs'
import { Router } from 'express'

import { asyncHandler } from '../middleware/asyncHandler'
import { requireSuperAdmin, USER_SELECT } from '../middleware/auth'
import { prisma } from '../prisma'
import {
  adminResetPasswordSchema,
  adminUpdateUserSchema,
  adminUserListQuerySchema,
  validateBody,
  validateQuery,
} from '../schemas'
import type { AuthenticatedRequest } from '../types'
import { getPasswordSaltRounds } from '../utils/password'
import { toUserResponse } from '../utils/responseTransformers'
import { readParam } from '../utils/routeParams'

const router = Router()

const USER_WITH_COUNT_SELECT = {
  ...USER_SELECT,
  _count: { select: { galleries: true } },
} as const

router.get(
  '/',
  requireSuperAdmin,
  validateQuery(adminUserListQuerySchema),
  asyncHandler(async (req, res) => {
    const { page, pageSize, q, role, status } = req.query as unknown as {
      page: number
      pageSize: number
      q?: string
      role?: 'user' | 'admin' | 'super_admin'
      status?: 'active' | 'banned'
    }

    const where = {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: 'insensitive' as const } },
              { email: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: USER_WITH_COUNT_SELECT,
      }),
      prisma.user.count({ where }),
    ])

    res.json({
      items: users.map((user) => toUserResponse(user, { galleriesCount: user._count.galleries })),
      total,
      page,
      pageSize,
    })
  })
)

router.patch(
  '/:uid',
  requireSuperAdmin,
  validateBody(adminUpdateUserSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const uid = readParam(req.params.uid)
    const { role, status, banReason } = req.body as {
      role?: 'user' | 'admin' | 'super_admin'
      status?: 'active' | 'banned'
      banReason?: string
    }

    if (uid === req.authUser!.uid) {
      res.status(400).json({ error: '不能修改自己的账号状态或角色' })
      return
    }

    const target = await prisma.user.findUnique({ where: { uid }, select: { uid: true } })
    if (!target) {
      res.status(404).json({ error: '用户不存在' })
      return
    }

    const banFields =
      status === undefined
        ? {}
        : status === 'banned'
          ? { bannedAt: new Date(), bannedByUid: req.authUser!.uid, banReason: banReason ?? null }
          : { bannedAt: null, bannedByUid: null, banReason: null }

    const updated = await prisma.user.update({
      where: { uid },
      data: {
        ...(role === undefined ? {} : { role }),
        ...(status === undefined ? {} : { status }),
        ...banFields,
      },
      select: USER_WITH_COUNT_SELECT,
    })

    res.json({
      user: toUserResponse(updated, { galleriesCount: updated._count.galleries }),
    })
  })
)

// 重置密码：密码哈希变化会让该用户所有旧会话失效
router.post(
  '/:uid/password',
  requireSuperAdmin,
  validateBody(adminResetPasswordSchema),
  asyncHandler(async (req, res) => {
    const uid = readParam(req.params.uid)
    const { password } = req.body as { password: string }

    const target = await prisma.user.findUnique({ where: { uid }, select: { uid: true } })
    if (!target) {
      res.status(404).json({ error: '用户不存在' })
      return
    }

    const passwordHash = await bcrypt.hash(password, getPasswordSaltRounds())
    await prisma.user.update({ where: { uid }, data: { passwordHash } })

    res.json({ success: true })
  })
)

export function registerAdminUserRoutes(app: Router) {
  app.use('/api/admin/users', router)
}
