import type { NextFunction, Request, Response, RequestHandler } from 'express'

// 把异步路由处理器的 rejection 交给 Express 错误中间件
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
