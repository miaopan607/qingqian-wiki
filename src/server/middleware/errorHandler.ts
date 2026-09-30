import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'

import { UPLOAD_MAX_FILE_SIZE_MB } from '../services/image.service'
import { logger } from '../utils/logger'

type HttpError = Error & { statusCode?: unknown; code?: unknown }

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `图片不能超过 ${UPLOAD_MAX_FILE_SIZE_MB}MB` })
      return
    }
    res.status(400).json({ error: err.message || '上传参数不合法' })
    return
  }

  if (err.message?.includes('仅支持')) {
    res.status(400).json({ error: err.message })
    return
  }

  const statusCode = err.statusCode
  if (typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
    res.status(statusCode).json({
      error: err.message,
      ...(typeof err.code === 'string' ? { code: err.code } : {}),
    })
    return
  }

  logger.error({ err }, 'Unhandled server error')
  res.status(500).json({ error: '服务器内部错误' })
}
