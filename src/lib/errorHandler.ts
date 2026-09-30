export class AppError extends Error {
  readonly statusCode: number
  readonly code?: string
  readonly fields?: Record<string, string>

  constructor(
    message: string,
    statusCode: number,
    options?: { code?: string; fields?: Record<string, string> }
  ) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = options?.code
    this.fields = options?.fields
  }
}

type AuthErrorCallback = (error: AppError) => void

let authErrorCallback: AuthErrorCallback | null = null

export function setAuthErrorCallback(callback: AuthErrorCallback | null): void {
  authErrorCallback = callback
}

export function classifyError(status: number, payload: unknown): AppError {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const message =
    typeof data.error === 'string' && data.error ? data.error : `请求失败（${status}）`
  const code = typeof data.code === 'string' ? data.code : undefined
  const fields =
    data.fields && typeof data.fields === 'object'
      ? (data.fields as Record<string, string>)
      : undefined

  return new AppError(message, status, { code, fields })
}

export function getErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  if (error instanceof AppError) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// 登录态或权限变化时通知上层刷新
export function notifyAuthError(error: AppError): void {
  if (!authErrorCallback) return

  const shouldRefresh =
    error.statusCode === 401 ||
    error.code === 'USER_BANNED' ||
    error.message === '账号已被封禁' ||
    error.message === '需要管理员权限' ||
    error.message === '需要超级管理员权限'

  if (shouldRefresh) authErrorCallback(error)
}
