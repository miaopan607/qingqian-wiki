import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { isTruthyEnvFlag } from '../../utils/runtimeEnv'
import type { StorageDriver } from './types'

let cachedClient: S3Client | null = null

function getPrefix(): string {
  return (process.env.S3_PREFIX ?? 'qingqian').trim().replace(/^\/+|\/+$/g, '')
}

// 对象 key 统一加前缀，便于与同桶内其它内容区分
function withPrefix(key: string): string {
  const prefix = getPrefix()
  return prefix ? `${prefix}/${key}` : key
}

function getClient(): S3Client {
  if (cachedClient) return cachedClient

  const endpoint = process.env.S3_ENDPOINT?.trim()
  cachedClient = new S3Client({
    region: process.env.S3_REGION?.trim() || 'auto',
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: isTruthyEnvFlag(process.env.S3_FORCE_PATH_STYLE),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() ?? '',
    },
  })
  return cachedClient
}

function bucketName(): string {
  return process.env.S3_BUCKET?.trim() ?? ''
}

// S3 兼容对象存储驱动：凭证由环境变量提供，仅新上传受影响
export const s3Driver: StorageDriver = {
  id: 's3',

  async put(key, body, contentType) {
    await getClient().send(
      new PutObjectCommand({
        Bucket: bucketName(),
        Key: withPrefix(key),
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    )
  },

  async delete(key) {
    await getClient().send(
      new DeleteObjectCommand({
        Bucket: bucketName(),
        Key: withPrefix(key),
      })
    )
  },

  url(key) {
    const base = (process.env.S3_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/g, '')
    return `${base}/${withPrefix(key)}`
  },
}
