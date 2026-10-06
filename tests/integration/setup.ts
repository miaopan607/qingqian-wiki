import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import request from 'supertest'
import { afterAll, beforeAll } from 'vitest'

import { app } from '../../server'
import { prisma } from '../../src/server/prisma'
import { getPasswordSaltRounds } from '../../src/server/utils/password'

dotenv.config({ path: '.env.test', override: true, quiet: true })

export { app, prisma }

// 按外键依赖顺序清库，保证每个用例从空库开始
export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.checkIn.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.favorite.deleteMany(),
    prisma.galleryLike.deleteMany(),
    prisma.galleryImage.deleteMany(),
    prisma.keycapImage.deleteMany(),
    prisma.gallery.deleteMany(),
    prisma.keycap.deleteMany(),
    prisma.mediaAsset.deleteMany(),
    prisma.user.deleteMany(),
    prisma.siteConfig.deleteMany(),
  ])
}

export async function seedSiteConfig(overrides?: {
  registrationOpen?: boolean
  name?: string
}): Promise<void> {
  const { invalidateSiteSettingsCache } =
    await import('../../src/server/services/siteConfig.service')

  await prisma.siteConfig.upsert({
    where: { key: 'site.registrationOpen' },
    update: { value: overrides?.registrationOpen ?? true },
    create: { key: 'site.registrationOpen', value: overrides?.registrationOpen ?? true },
  })
  await prisma.siteConfig.upsert({
    where: { key: 'site.name' },
    update: { value: overrides?.name ?? '清浅 Wiki' },
    create: { key: 'site.name', value: overrides?.name ?? '清浅 Wiki' },
  })

  invalidateSiteSettingsCache()
}

let userCounter = 0

export async function createTestUser(overrides?: {
  email?: string
  password?: string
  displayName?: string
  role?: 'user' | 'admin' | 'super_admin'
}) {
  userCounter += 1
  const email = overrides?.email ?? `user${userCounter}_${Date.now()}@qq.test`
  const password = overrides?.password ?? 'testPass123'
  const displayName = overrides?.displayName ?? `测试用户${userCounter}`
  const passwordHash = await bcrypt.hash(password, getPasswordSaltRounds())

  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      displayName,
      role: overrides?.role ?? 'user',
    },
  })

  return { user, password }
}

type HeaderBag = Record<string, string | string[] | undefined>

function readCookie(headers: HeaderBag, name: string): string | null {
  const raw = headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
  // 同名 cookie 可能多次下发，取最后一个（与浏览器行为一致）
  const matches = cookies.filter((cookie) => cookie.startsWith(`${name}=`))
  if (matches.length === 0) return null
  return decodeURIComponent(matches[matches.length - 1].split(';')[0].slice(name.length + 1))
}

// 站点配置有 5 秒内存缓存，测试改库后必须显式失效
export async function setRegistrationOpen(open: boolean): Promise<void> {
  const { invalidateSiteSettingsCache } =
    await import('../../src/server/services/siteConfig.service')
  await prisma.siteConfig.upsert({
    where: { key: 'site.registrationOpen' },
    update: { value: open },
    create: { key: 'site.registrationOpen', value: open },
  })
  invalidateSiteSettingsCache()
}

// 登录后返回带会话的 agent 与 CSRF 令牌（写请求需要）
export async function loginAgent(email: string, password: string) {
  const agent = request.agent(app)
  const response = await agent.post('/api/auth/login').send({ email, password })

  return {
    agent,
    response,
    xsrf: readCookie(response.headers, 'XSRF-TOKEN') ?? '',
  }
}

export function createAnonymousAgent() {
  return request.agent(app)
}

// 真实可解码的小图，用于上传相关用例
export async function createTestImageBuffer(
  width = 40,
  height = 30,
  format: 'png' | 'jpeg' = 'png'
): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  const pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 80, g: 120, b: 140 } },
  })
  return format === 'png' ? pipeline.png().toBuffer() : pipeline.jpeg().toBuffer()
}

export async function uploadTestAsset(
  agent: ReturnType<typeof request.agent>,
  xsrf: string,
  options?: { filename?: string; contentType?: string; buffer?: Buffer }
) {
  const buffer = options?.buffer ?? (await createTestImageBuffer())

  const response = await agent
    .post('/api/admin/uploads/images')
    .set('X-XSRF-TOKEN', xsrf)
    .attach('file', buffer, {
      filename: options?.filename ?? 'test.png',
      contentType: options?.contentType ?? 'image/png',
    })

  return response
}

beforeAll(async () => {
  await prisma.$connect()
})

afterAll(async () => {
  await prisma.$disconnect()
})
