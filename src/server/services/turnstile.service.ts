import { isIP } from 'net'

import { AppError } from '../utils/appError'

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TURNSTILE_TIMEOUT_MS = 10000
const HOSTNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/

type TurnstileConfig = {
  siteKey: string
  secretKey: string
  hostnames: string[]
}

function getTurnstileConfig(): TurnstileConfig | null {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim()
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim()
  const configuredHostnames = process.env.TURNSTILE_HOSTNAMES?.trim()
  if (!siteKey || !secretKey || !configuredHostnames) return null

  const hostnames = configuredHostnames.split(',').map((hostname) => hostname.trim().toLowerCase())
  if (
    hostnames.some(
      (hostname) =>
        hostname.length > 253 || !HOSTNAME_PATTERN.test(hostname) || isIP(hostname) !== 0
    )
  ) {
    return null
  }

  return { siteKey, secretKey, hostnames }
}

// 仅在三项配置均有效时公开 site key，secret 始终留在服务端。
export function getTurnstileSiteKey(): string | null {
  return getTurnstileConfig()?.siteKey ?? null
}

function unavailableError(): AppError {
  return new AppError('人机验证服务暂不可用，请稍后重试', 503, 'TURNSTILE_UNAVAILABLE')
}

export async function verifyCheckInTurnstile(token: string, remoteIp?: string): Promise<void> {
  const config = getTurnstileConfig()
  if (!config) {
    throw new AppError('签到人机验证尚未配置', 503, 'TURNSTILE_NOT_CONFIGURED')
  }

  let response: Response
  try {
    response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: config.secretKey,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
    })
  } catch {
    // 不记录上游响应或请求参数，避免泄露 secret 与一次性 token。
    throw unavailableError()
  }
  if (!response.ok) throw unavailableError()

  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw unavailableError()
  }

  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw unavailableError()
  }
  const verification = result as Record<string, unknown>
  if (
    typeof verification.success !== 'boolean' ||
    (verification.action !== undefined && typeof verification.action !== 'string') ||
    (verification.hostname !== undefined && typeof verification.hostname !== 'string')
  ) {
    throw unavailableError()
  }
  // Cloudflare 拒绝 token 时可以省略 action 与 hostname，成功时两者必须有效。
  if (
    verification.success &&
    (typeof verification.action !== 'string' || typeof verification.hostname !== 'string')
  ) {
    throw unavailableError()
  }
  if (
    !verification.success ||
    verification.action !== 'check-in' ||
    !config.hostnames.includes((verification.hostname as string).toLowerCase())
  ) {
    throw new AppError('人机验证失败，请重新验证', 400, 'TURNSTILE_FAILED')
  }
}
