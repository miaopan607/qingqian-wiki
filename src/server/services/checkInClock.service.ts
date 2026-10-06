import '../env'

const configuredTime = process.env.CHECK_IN_DEV_TIME?.trim()
const debugStart = configuredTime ? Date.parse(configuredTime) : null
if (configuredTime) {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
    throw new Error('CHECK_IN_DEV_TIME 仅允许在开发环境使用，请在生产或测试环境移除该配置')
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(configuredTime) || !Number.isFinite(debugStart)) {
    throw new Error('CHECK_IN_DEV_TIME 必须为带时区的时间，例如2026-10-07T05:00:00+08:00')
  }
}

export const CHECK_IN_DEBUG = debugStart !== null
const startedAt = performance.now()

// 仅推进签到活动时钟；登录、CSRF及Cloudflare验证仍使用真实时间。
export function getCheckInNow(): Date {
  return new Date(debugStart === null ? Date.now() : debugStart + performance.now() - startedAt)
}
