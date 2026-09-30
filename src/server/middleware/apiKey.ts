import type { NextFunction, Request, Response } from 'express'

import { authenticateApiKey } from '../services/apiKey.service'
import type { AuthenticatedRequest } from '../types'
import { apiKeyLimiter } from './rateLimit'
import { AppError } from '../utils/appError'

const API_KEY_AUTH_HEADER = /^Bearer ([^\s,]+)$/i

type EndpointPermission = { write?: boolean; admin?: boolean }

function matchApiKeyEndpoint(method: string, pathname: string): EndpointPermission | null {
  if (/%|\\/.test(pathname)) return null
  const path = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  const isRead = method === 'GET' || method === 'HEAD'

  if (
    isRead &&
    (/^\/api\/(galleries|keycaps)$/.test(path) || /^\/api\/(galleries|keycaps)\/[^/]+$/.test(path))
  ) {
    return {}
  }
  if (
    isRead &&
    (/^\/api\/admin\/galleries$/.test(path) || /^\/api\/admin\/galleries\/[^/]+$/.test(path))
  ) {
    return { admin: true }
  }
  if (method === 'POST' && path === '/api/admin/uploads/images') return { write: true, admin: true }
  if (method === 'POST' && path === '/api/admin/galleries') return { write: true, admin: true }
  if (method === 'PATCH' && /^\/api\/admin\/galleries\/[^/]+$/.test(path))
    return { write: true, admin: true }
  if (method === 'DELETE' && /^\/api\/admin\/uploads\/[^/]+$/.test(path))
    return { write: true, admin: true }
  return null
}

function unauthorized(): AppError {
  return new AppError('API 密钥无效或已失效', 401, 'API_KEY_INVALID')
}

export async function authenticateApiKeyRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  try {
    const rawHeaders = req.rawHeaders
    let authorizationHeaderCount = 0
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index].toLowerCase() === 'authorization') authorizationHeaderCount += 1
    }
    if (authorizationHeaderCount !== 1 || Array.isArray(req.headers.authorization))
      throw unauthorized()

    const authorization = req.headers.authorization
    const match =
      typeof authorization === 'string' ? authorization.trim().match(API_KEY_AUTH_HEADER) : null
    if (!match) throw unauthorized()

    const { user, apiKey } = await authenticateApiKey(match[1])
    const authReq = req as AuthenticatedRequest
    authReq.authUser = user
    authReq.authMethod = 'api_key'
    authReq.apiKey = apiKey

    apiKeyLimiter(req, res, (limitError) => {
      if (limitError) {
        next(limitError)
        return
      }

      try {
        const permission = matchApiKeyEndpoint(req.method.toUpperCase(), req.path)
        if (!permission) {
          throw new AppError('此接口不支持 API 密钥访问', 403, 'API_KEY_ENDPOINT_FORBIDDEN')
        }
        if (permission.write && apiKey.scope !== 'read_write') {
          throw new AppError('API 密钥没有写入权限', 403, 'API_KEY_SCOPE_FORBIDDEN')
        }
        if (permission.admin && user.role !== 'admin' && user.role !== 'super_admin') {
          throw new AppError('需要管理员权限', 403)
        }
        next()
      } catch (error) {
        next(error)
      }
    })
  } catch (error) {
    next(error)
  }
}
