import crypto from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import type { AuthenticatedRequest } from '../types'

const XSRF_COOKIE_NAME = 'XSRF-TOKEN'
const XSRF_HEADER_NAME = 'x-xsrf-token'
const XSRF_TOKEN_BYTES = 24
const XSRF_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

const SAFE_METHODS: Record<string, true> = { GET: true, HEAD: true, OPTIONS: true }

function xsrfCookieOptions(req: Request) {
  return {
    httpOnly: false,
    sameSite: 'lax' as const,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    path: '/',
    maxAge: XSRF_COOKIE_MAX_AGE_MS,
  }
}

export function issueXsrfToken(res: Response): void {
  // 同一响应只下发一次，避免重复 Set-Cookie 导致客户端读到旧值
  if (res.locals.xsrfIssued) return
  res.locals.xsrfIssued = true

  const token = crypto.randomBytes(XSRF_TOKEN_BYTES).toString('base64url')
  res.cookie(XSRF_COOKIE_NAME, token, xsrfCookieOptions(res.req))
}

// 双提交校验：Cookie 与请求头必须同时存在且逐字节一致
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if ((req as AuthenticatedRequest).authMethod === 'api_key') {
    next()
    return
  }
  const existing = req.cookies?.[XSRF_COOKIE_NAME]
  if (!existing || typeof existing !== 'string') {
    issueXsrfToken(res)
  }

  if (SAFE_METHODS[req.method.toUpperCase()]) {
    next()
    return
  }

  const authReq = req as AuthenticatedRequest
  if (!authReq.authUser) {
    // 注册、登录等无会话请求没有可保护的凭据
    next()
    return
  }

  const cookieToken = req.cookies?.[XSRF_COOKIE_NAME]
  const headerToken = req.headers[XSRF_HEADER_NAME]
  const headerValue = Array.isArray(headerToken) ? headerToken[0] : headerToken

  if (!cookieToken || !headerValue) {
    res.status(403).json({ error: 'CSRF token missing', code: 'CSRF_MISSING' })
    return
  }

  const cookieBuf = Buffer.from(String(cookieToken))
  const headerBuf = Buffer.from(headerValue)
  if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    res.status(403).json({ error: 'CSRF token mismatch', code: 'CSRF_MISMATCH' })
    return
  }

  next()
}
