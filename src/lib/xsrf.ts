const XSRF_COOKIE_NAME = 'XSRF-TOKEN'

// 写请求需要带回双提交令牌
export function getXsrfToken(): string | null {
  if (typeof document === 'undefined') return null

  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${XSRF_COOKIE_NAME}=([^;]*)`))
  if (!match) return null

  const value = decodeURIComponent(match[1])
  return value || null
}
