import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true, quiet: true })

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('未找到 DATABASE_URL，请确认 .env.test 存在')
  process.exit(1)
}

const target = new URL(databaseUrl)
const databaseName = target.pathname.replace(/^\//, '')
if (!databaseName) {
  console.error('DATABASE_URL 缺少数据库名')
  process.exit(1)
}

// 连到 postgres 库创建测试库（已存在则跳过），再执行迁移
const adminUrl = new URL(databaseUrl)
adminUrl.pathname = '/postgres'

async function ensureDatabase(): Promise<void> {
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } })

  try {
    const existing = await admin.$queryRaw<
      Array<{ datname: string }>
    >`SELECT datname FROM pg_database WHERE datname = ${databaseName}`

    if (existing.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`)
      console.log(`已创建测试数据库 ${databaseName}`)
    } else {
      console.log(`测试数据库 ${databaseName} 已存在`)
    }
  } finally {
    await admin.$disconnect()
  }
}

async function run(): Promise<void> {
  await ensureDatabase()

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })

  console.log('测试数据库已就绪')
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
