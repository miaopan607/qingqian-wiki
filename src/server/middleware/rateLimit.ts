import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { isProductionRuntime, isTestRuntime, isTruthyEnvFlag } from '../utils/runtimeEnv'
import type { AuthenticatedRequest } from '../types'

const MINUTE = 60 * 1000

type LimiterOptions = {
  windowMs: number
  limit: number
}

// 仅开发环境可用 DEV_DISABLE_RATE_LIMIT 关闭限流（本地联调/自动化验证用）
function isRateLimitDisabled(): boolean {
  if (isTestRuntime()) return true
  return !isProductionRuntime() && isTruthyEnvFlag(process.env.DEV_DISABLE_RATE_LIMIT)
}

// 已登录按用户计数，未登录按 IP 计数（IPv6 走库的归一化处理）
function requestKey(req: Request): string {
  const uid = (req as AuthenticatedRequest).authUser?.uid
  if (uid) return `uid:${uid}`
  return ipKeyGenerator(req.ip ?? '')
}

function createLimiter(options: LimiterOptions): RequestHandler {
  if (isRateLimitDisabled()) {
    return (_req: Request, _res: Response, next: NextFunction) => next()
  }

  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: requestKey,
    handler: (_req, res) => {
      res.status(429).json({ error: '请求过于频繁，请稍后再试' })
    },
  })
}

export const globalLimiter = createLimiter({ windowMs: MINUTE, limit: 300 })
export const authLimiter = createLimiter({ windowMs: 15 * MINUTE, limit: 10 })
export const uploadLimiter = createLimiter({ windowMs: 10 * MINUTE, limit: 60 })
export const writeLimiter = createLimiter({ windowMs: MINUTE, limit: 60 })
