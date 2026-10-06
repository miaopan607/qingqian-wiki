/// <reference lib="es2024.promise" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getTurnstileSiteKey,
  verifyCheckInTurnstile,
} from '../../src/server/services/turnstile.service'

const fetchMock = vi.fn()
const failedError = {
  statusCode: 400,
  code: 'TURNSTILE_FAILED',
}
const unavailableError = {
  statusCode: 503,
  code: 'TURNSTILE_UNAVAILABLE',
}
const notConfiguredError = {
  statusCode: 503,
  code: 'TURNSTILE_NOT_CONFIGURED',
}

function cloudflareResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubEnv('TURNSTILE_SITE_KEY', ' site-key ')
  vi.stubEnv('TURNSTILE_SECRET_KEY', ' secret-key ')
  vi.stubEnv('TURNSTILE_HOSTNAMES', ' Wiki.Example.com, localhost ')
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(
    cloudflareResponse({ success: true, action: 'check-in', hostname: 'wiki.example.com' })
  )
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Turnstile配置失败封闭', () => {
  it.each(['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_HOSTNAMES'])(
    '%s 缺失或空白时不公开 site key，也不尝试验证',
    async (key) => {
      for (const value of [undefined, '', '   ']) {
        vi.stubEnv(key, value)
        expect(getTurnstileSiteKey()).toBeNull()
        await expect(verifyCheckInTurnstile('token')).rejects.toMatchObject(notConfiguredError)
      }
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it.each([
    'https://wiki.example.com',
    'wiki.example.com/path',
    'wiki.example.com:443',
    'localhost:5173',
    '127.0.0.1',
    '::1',
    'wiki.example.com?query=1',
    'wiki.example.com#fragment',
    '*.example.com',
    'wiki.example.com,',
    ',localhost',
    'wiki.example.com,,localhost',
    'wiki example.com',
    '-wiki.example.com',
    'wiki..example.com',
    `${'a'.repeat(64)}.example.com`,
    `${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}`,
  ])('hostname 配置 %s 非法时失败封闭', async (hostname) => {
    vi.stubEnv('TURNSTILE_HOSTNAMES', hostname)
    expect(getTurnstileSiteKey()).toBeNull()
    await expect(verifyCheckInTurnstile('token')).rejects.toMatchObject(notConfiguredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('verifyCheckInTurnstile', () => {
  it.each([
    { success: false },
    { success: false, 'error-codes': ['invalid-input-response'] },
    { success: false, 'error-codes': ['timeout-or-duplicate'] },
    { success: true, action: 'login', hostname: 'wiki.example.com' },
    { success: true, action: '', hostname: 'wiki.example.com' },
    { success: true, action: 'check-in', hostname: 'other.example.com' },
    { success: true, action: 'check-in', hostname: 'wiki.example.com.evil.test' },
    { success: true, action: 'check-in', hostname: 'https://wiki.example.com' },
    { success: true, action: 'check-in', hostname: '' },
  ])('无效 token、action 或 hostname 不通过：%j', async (result) => {
    fetchMock.mockResolvedValue(cloudflareResponse(result))
    await expect(verifyCheckInTurnstile('token')).rejects.toMatchObject(failedError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    null,
    [],
    true,
    'success',
    {},
    { success: 'true', action: 'check-in', hostname: 'wiki.example.com' },
    { success: 1, action: 'check-in', hostname: 'wiki.example.com' },
    { success: true, hostname: 'wiki.example.com' },
    { success: true, action: 'check-in' },
    { success: true, action: null, hostname: 'wiki.example.com' },
    { success: true, action: 'check-in', hostname: 123 },
    { success: false, action: {} },
    { success: false, hostname: [] },
  ])('非法响应视为服务不可用而不是通过：%j', async (result) => {
    fetchMock.mockResolvedValue(cloudflareResponse(result))
    await expect(verifyCheckInTurnstile('token')).rejects.toMatchObject(unavailableError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([429, 500, 503])('HTTP %s 不消费第二次 token，也不放行', async (status) => {
    fetchMock.mockResolvedValue(
      cloudflareResponse(
        { success: true, action: 'check-in', hostname: 'wiki.example.com' },
        status
      )
    )
    await expect(verifyCheckInTurnstile('token')).rejects.toMatchObject(unavailableError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('非 JSON 响应视为服务不可用', async () => {
    fetchMock.mockResolvedValue(new Response('<html>upstream unavailable</html>'))
    await expect(verifyCheckInTurnstile('token')).rejects.toMatchObject(unavailableError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('网络异常使用固定安全错误，不泄露上游信息或自动重试', async () => {
    fetchMock.mockRejectedValue(new Error('network failure with secret-key and private-token'))
    const verification = verifyCheckInTurnstile('private-token')
    await expect(verification).rejects.toMatchObject(unavailableError)
    await expect(verification).rejects.not.toThrow(/secret-key|private-token/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('等待十秒后中止上游验证，并拒绝本次签到', async () => {
    let requestSignal: AbortSignal | undefined
    fetchMock.mockImplementation((_url: string, options: RequestInit) => {
      const signal = options.signal as AbortSignal
      requestSignal = signal
      const { promise, reject } = Promise.withResolvers<Response>()
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      return promise
    })
    const startedAt = Date.now()
    await expect(verifyCheckInTurnstile('token')).rejects.toMatchObject(unavailableError)
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(9900)
    expect(requestSignal?.aborted).toBe(true)
    expect(requestSignal?.reason.name).toBe('TimeoutError')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  }, 15000)
})
