type RuntimeEnv = NodeJS.ProcessEnv

export function isTruthyEnvFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value !== 'string') return false

  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1'
}

export function isTestRuntime(env: RuntimeEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'test' || isTruthyEnvFlag(env.VITEST) || env.VITEST_WORKER_ID !== undefined
  )
}

export function isProductionRuntime(env: RuntimeEnv = process.env): boolean {
  return env.NODE_ENV === 'production'
}

// 生产环境启动前的安全断言：JWT 密钥缺失或过短会让会话可被伪造
export function assertSafeProductionEnv(env: RuntimeEnv = process.env): void {
  if (!isProductionRuntime(env)) return

  const secret = env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set with at least 32 characters when NODE_ENV=production')
  }
}
