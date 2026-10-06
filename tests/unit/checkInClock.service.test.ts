import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('NODE_ENV', 'development')
  vi.stubEnv('CHECK_IN_DEV_TIME', '2026-10-07T05:00:00+08:00')
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
})

// 配置在模块初始化时固定，测试需重新加载模块验证环境边界。
async function loadClock() {
  return import('../../src/server/services/checkInClock.service')
}

describe('开发签到时钟', () => {
  it('按单调时钟经过的时长推进活动时间', async () => {
    const monotonic = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const clock = await loadClock()
    expect(clock.CHECK_IN_DEBUG).toBe(true)
    monotonic.mockReturnValue(2500)
    expect(clock.getCheckInNow().toISOString()).toBe('2026-10-06T21:00:01.500Z')
  })
  it.each(['production', 'test'])('%s环境拒绝调试配置', async (runtime) => {
    vi.stubEnv('NODE_ENV', runtime)
    await expect(loadClock()).rejects.toThrow(/CHECK_IN_DEV_TIME/)
  })
  it.each(['invalid', '2026-10-07T05:00:00'])('拒绝无效或没有时区的时间：%s', async (time) => {
    vi.stubEnv('CHECK_IN_DEV_TIME', time)
    await expect(loadClock()).rejects.toThrow(/CHECK_IN_DEV_TIME/)
  })
  it('移除调试配置后生产环境使用真实时间', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('CHECK_IN_DEV_TIME', '')
    const before = Date.now()
    const clock = await loadClock()
    expect(clock.CHECK_IN_DEBUG).toBe(false)
    expect(clock.getCheckInNow().getTime()).toBeGreaterThanOrEqual(before)
    expect(clock.getCheckInNow().getTime()).toBeLessThanOrEqual(Date.now())
  })
})
