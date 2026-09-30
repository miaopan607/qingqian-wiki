import { PrismaClient } from '@prisma/client'
import os from 'os'
import { isProductionRuntime, isTestRuntime } from './utils/runtimeEnv'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 连接池参数按 CPU 核数推算，单机小站足够，避免连接数打满数据库
function buildDatabaseUrl(): string {
  const baseUrl = process.env.DATABASE_URL
  if (!baseUrl) return baseUrl
  try {
    const url = new URL(baseUrl)
    const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT) || os.cpus().length * 2 + 1
    const poolTimeout = Number(process.env.DB_POOL_TIMEOUT) || 10
    url.searchParams.set('connection_limit', String(connectionLimit))
    url.searchParams.set('pool_timeout', String(poolTimeout))
    return url.toString()
  } catch {
    return baseUrl
  }
}

const isDev = !isProductionRuntime()
const isTest = isTestRuntime()

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: buildDatabaseUrl() } },
    log: isTest ? [] : isDev ? ['error', 'warn'] : ['error'],
  })

if (isDev) {
  globalForPrisma.prisma = prisma
}

export default prisma
