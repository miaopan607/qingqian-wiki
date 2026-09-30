import { isTestRuntime } from './runtimeEnv'

// 测试环境使用低代价因子加速，生产默认 12
export function getPasswordSaltRounds(): number {
  if (isTestRuntime()) return 4

  const parsed = Number(process.env.BCRYPT_SALT_ROUNDS)
  return Number.isInteger(parsed) && parsed >= 4 && parsed <= 15 ? parsed : 12
}
