import crypto from 'crypto'
import type { ApiKey } from '@prisma/client'

import { USER_SELECT, createSessionVersion, toApiUser } from '../middleware/auth'
import { prisma } from '../prisma'
import type { ApiUser } from '../types'
import { AppError } from '../utils/appError'

const API_KEY_PREFIX = 'qq_api_'
const API_KEY_PATTERN = /^qq_api_[A-Za-z0-9_-]{43}$/
const MAX_ACTIVE_API_KEYS = 10

export type ApiKeyMetadata = {
  id: string
  name: string
  tokenPrefix: string
  scope: 'read' | 'read_write'
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  status: 'active' | 'expired' | 'revoked' | 'invalidated'
}

export type ApiKeyRecord = {
  id: string
  scope: 'read' | 'read_write'
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function metadataFromRecord(
  key: Pick<
    ApiKey,
    | 'id'
    | 'name'
    | 'tokenPrefix'
    | 'scope'
    | 'createdAt'
    | 'expiresAt'
    | 'revokedAt'
    | 'sessionVersion'
  >,
  currentSessionVersion: string
): ApiKeyMetadata {
  const status = key.revokedAt
    ? 'revoked'
    : key.sessionVersion !== currentSessionVersion
      ? 'invalidated'
      : key.expiresAt && key.expiresAt.getTime() <= Date.now()
        ? 'expired'
        : 'active'

  return {
    id: key.id,
    name: key.name,
    tokenPrefix: key.tokenPrefix,
    scope: key.scope,
    createdAt: key.createdAt.toISOString(),
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    status,
  }
}

export async function createApiKey(
  userUid: string,
  input: { name: string; scope: 'read' | 'read_write'; expiresInDays: 30 | 90 | 365 | null }
): Promise<{ apiKey: ApiKeyMetadata; token: string }> {
  const token = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
  const tokenHash = hashToken(token)
  const now = new Date()
  const expiresAt =
    input.expiresInDays === null ? null : new Date(now.getTime() + input.expiresInDays * 86400000)

  const created = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<
      Array<{ uid: string }>
    >`SELECT uid FROM "User" WHERE uid = ${userUid} FOR UPDATE`
    const user = await tx.user.findUnique({
      where: { uid: userUid },
      select: { passwordHash: true, status: true },
    })
    if (!user) throw new AppError('用户不存在', 404)
    if (user.status === 'banned') throw new AppError('账号已被封禁', 403, 'USER_BANNED')

    const sessionVersion = createSessionVersion(user.passwordHash)
    const activeCount = await tx.apiKey.count({
      where: {
        userUid,
        revokedAt: null,
        sessionVersion,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    })
    if (activeCount >= MAX_ACTIVE_API_KEYS) {
      throw new AppError('最多同时持有 10 把有效 API 密钥', 409, 'API_KEY_LIMIT')
    }

    const apiKey = await tx.apiKey.create({
      data: {
        userUid,
        name: input.name,
        tokenHash,
        tokenPrefix: token.slice(0, 14),
        scope: input.scope,
        sessionVersion,
        expiresAt,
      },
    })
    return { apiKey, sessionVersion }
  })

  return {
    apiKey: metadataFromRecord(created.apiKey, created.sessionVersion),
    token,
  }
}

export async function listApiKeys(
  userUid: string,
  currentSessionVersion: string
): Promise<ApiKeyMetadata[]> {
  const keys = await prisma.apiKey.findMany({
    where: { userUid },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      scope: true,
      createdAt: true,
      expiresAt: true,
      revokedAt: true,
      sessionVersion: true,
    },
  })
  return keys.map((key) => metadataFromRecord(key, currentSessionVersion))
}

export async function revokeApiKey(userUid: string, id: string): Promise<void> {
  const key = await prisma.apiKey.findFirst({
    where: { id, userUid },
    select: { id: true, revokedAt: true },
  })
  if (!key) throw new AppError('API 密钥不存在', 404)
  if (key.revokedAt) return
  await prisma.apiKey.updateMany({
    where: { id, userUid, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function authenticateApiKey(
  token: string
): Promise<{ user: ApiUser; apiKey: ApiKeyRecord }> {
  if (!API_KEY_PATTERN.test(token))
    throw new AppError('API 密钥无效或已失效', 401, 'API_KEY_INVALID')

  const key = await prisma.apiKey.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: USER_SELECT } },
  })
  const now = Date.now()
  if (
    !key ||
    key.revokedAt ||
    (key.expiresAt && key.expiresAt.getTime() <= now) ||
    key.sessionVersion !== createSessionVersion(key.user.passwordHash)
  ) {
    throw new AppError('API 密钥无效或已失效', 401, 'API_KEY_INVALID')
  }
  if (key.user.status === 'banned') throw new AppError('账号已被封禁', 403, 'USER_BANNED')

  return {
    user: toApiUser(key.user),
    apiKey: { id: key.id, scope: key.scope },
  }
}
