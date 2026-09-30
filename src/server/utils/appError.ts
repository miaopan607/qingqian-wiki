// 业务错误统一携带 statusCode，由 errorHandler 中间件映射为响应
export class AppError extends Error {
  readonly statusCode: number
  readonly code?: string

  constructor(message: string, statusCode = 400, code?: string) {
    super(message)
    this.name = new.target.name
    this.statusCode = statusCode
    this.code = code
  }
}

export class SiteConfigError extends AppError {}

export class ImageProcessingError extends AppError {}
