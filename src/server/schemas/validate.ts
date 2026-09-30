import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

// 请求体校验：失败时按字段返回错误消息，前端可直接映射到表单项
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      const fields: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.')
        if (!fields[key]) fields[key] = issue.message
      }
      res.status(400).json({ error: 'Validation failed', fields })
      return
    }

    req.body = result.data
    next()
  }
}

// 查询串校验：非法分页参数回退默认值（schema 内用 .catch 处理）
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query)

    if (!result.success) {
      const fields: Record<string, string> = {}
      for (const issue of result.error.issues) {
        const key = issue.path.join('.')
        if (!fields[key]) fields[key] = issue.message
      }
      res.status(400).json({ error: 'Validation failed', fields })
      return
    }

    // Express 5 的 req.query 是只读 getter，只能在实例上重新定义
    Object.defineProperty(req, 'query', {
      value: result.data,
      writable: false,
      configurable: true,
      enumerable: true,
    })
    next()
  }
}
