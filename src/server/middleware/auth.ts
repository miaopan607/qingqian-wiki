import crypto from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { Prisma } from '@prisma/client'

import { prisma } from '../prisma'
import { resolveAssetUrls } from '../services/media.service'
import type { ApiUser, AuthenticatedRequest } from '../types'
import { issueXsrfToken } from './csrf'

export const AUTH_COOKIE_NAME = 'qq_token'
export const AUTH_SESSION_DAYS = 90
const AUTH_SESSION_TTL_MS = AUTH_SESSION_DAYS * 24 * 60 * 60 * 1000

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set with at least 32 characters')
}

export const USER_SELECT = {
  uid: true,
  email: true,
  displayName: true,
  bio: true,
  role: true,
  status: true,
  banReason: true,
  bannedAt: true,
  passwordHash: true,
  createdAt: true,
  avatarAsset: { select: { driver: true, storageKey: true, displayKey: true, thumbKey: true } },
} satisfies Prisma.UserSelect

export type SessionUserRecord = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>

export type SessionPayload = {
  uid: string
  role: string
  sessionVersion: string
}

// 会话版本由密码哈希派生：改密后旧 token 自动失效
export function createSessionVersion(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16)
}

export function shouldUseSecureCookie(req: Request): boolean {
  const override = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (override === 'true') return true
  if (override === 'false') return false
  return req.secure || req.headers['x-forwarded-proto'] === 'https'
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' })
}

export function issueUserSession(req: Request, res: Response, user: SessionUserRecord): string {
  const token = jwt.sign(
    {
      uid: user.uid,
      role: user.role,
      sessionVersion: createSessionVersion(user.passwordHash),
    },
    JWT_SECRET,
    { expiresIn: `${AUTH_SESSION_DAYS}d` }
  )

  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureCookie(req),
    path: '/',
    maxAge: AUTH_SESSION_TTL_MS,
  })
  issueXsrfToken(res)

  return token
}

export function toApiUser(user: SessionUserRecord): ApiUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    role: user.role,
    status: user.status,
    banReason: user.banReason,
    bannedAt: user.bannedAt ? user.bannedAt.toISOString() : null,
    avatarUrl: user.avatarAsset ? resolveAssetUrls(user.avatarAsset).thumbUrl : null,
  }
}

function readTokenFromCookie(req: Request): string | null {
  const raw = req.cookies?.[AUTH_COOKIE_NAME]
  if (!raw || typeof raw !== 'string') return null
  return raw
}

export async function findSessionUser(req: Request): Promise<SessionUserRecord | null> {
  const token = readTokenFromCookie(req)
  if (!token) return null

  let payload: SessionPayload
  try {
    payload = jwt.verify(token, JWT_SECRET) as SessionPayload
  } catch {
    return null
  }

  const user = await prisma.user.findUnique({ where: { uid: payload.uid }, select: USER_SELECT })
  if (!user) return null
  if (payload.sessionVersion !== createSessionVersion(user.passwordHash)) return null

  return user
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await findSessionUser(req)
    if (!user) {
      if (readTokenFromCookie(req)) {
        clearAuthCookie(res)
      }
      next()
      return
    }

    ;(req as AuthenticatedRequest).authUser = toApiUser(user)
  } catch {
    // 认证失败不应中断请求，按匿名继续
    clearAuthCookie(res)
  }

  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!(req as AuthenticatedRequest).authUser) {
    res.status(401).json({ error: '需要先登录' })
    return
  }
  next()
}

export function requireActiveUser(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).authUser
  if (!user) {
    res.status(401).json({ error: '需要先登录' })
    return
  }
  if (user.status === 'banned') {
    res.status(403).json({ error: '账号已被封禁', code: 'USER_BANNED' })
    return
  }
  next()
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).authUser
  if (!user) {
    res.status(401).json({ error: '需要先登录' })
    return
  }
  if (user.status === 'banned') {
    res.status(403).json({ error: '账号已被封禁', code: 'USER_BANNED' })
    return
  }
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    res.status(403).json({ error: '需要管理员权限' })
    return
  }
  next()
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).authUser
  if (!user) {
    res.status(401).json({ error: '需要先登录' })
    return
  }
  if (user.status === 'banned') {
    res.status(403).json({ error: '账号已被封禁', code: 'USER_BANNED' })
    return
  }
  if (user.role !== 'super_admin') {
    res.status(403).json({ error: '需要超级管理员权限' })
    return
  }
  next()
}
