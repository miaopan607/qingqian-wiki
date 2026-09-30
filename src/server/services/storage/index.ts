import { localDriver } from './local'
import { s3Driver } from './s3'
import type { StorageDriver, StorageDriverId } from './types'

export type { StorageDriver, StorageDriverId } from './types'

// 对象 key：按类型与年月分层，文件名带 assetId 保证不可变（可长缓存）
export function buildObjectKey(
  dir: 'images' | 'avatars',
  assetId: string,
  suffix: string,
  ext: string
): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const name = suffix ? `${assetId}_${suffix}` : assetId
  return `${dir}/${now.getFullYear()}/${month}/${name}.${ext}`
}

export function isS3Configured(): boolean {
  return Boolean(process.env.S3_BUCKET?.trim() && process.env.S3_PUBLIC_BASE_URL?.trim())
}

export function getStorageDriver(id: StorageDriverId): StorageDriver {
  return id === 's3' ? s3Driver : localDriver
}
