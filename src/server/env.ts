import dotenv from 'dotenv'
import { assertSafeProductionEnv, isProductionRuntime, isTestRuntime } from './utils/runtimeEnv'

// 在任何模块读取 process.env 之前加载环境变量。
// 测试环境由 vitest 提供变量；本地开发允许 .env.local 覆盖 .env。
const isTestEnv = isTestRuntime()

if (!isTestEnv && !isProductionRuntime()) {
  dotenv.config({ path: '.env.local', quiet: true })
}

if (!isTestEnv) {
  dotenv.config({ quiet: true })
}

assertSafeProductionEnv()
