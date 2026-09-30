import fs from 'fs/promises'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'

import { buildObjectKey, getStorageDriver, isS3Configured } from '../../src/server/services/storage'
import { getUploadsDir } from '../../src/server/utils/uploadsPath'

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
})

describe('buildObjectKey', () => {
  it('按类型与年月分层并保留后缀', () => {
    const key = buildObjectKey('images', 'abc123', 't', 'webp')
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')

    expect(key).toBe(`images/${now.getFullYear()}/${month}/abc123_t.webp`)
  })

  it('无后缀时不产生多余下划线', () => {
    expect(buildObjectKey('avatars', 'abc123', '', 'webp')).toMatch(
      /^avatars\/\d{4}\/\d{2}\/abc123\.webp$/
    )
  })
})

describe('local 驱动', () => {
  it('写入、读取与删除文件', async () => {
    const driver = getStorageDriver('local')
    const key = buildObjectKey('images', `unit-test-${Date.now()}`, 'o', 'txt')

    await driver.put(key, Buffer.from('hello'), 'text/plain')
    const written = await fs.readFile(path.join(getUploadsDir(), key), 'utf-8')
    expect(written).toBe('hello')
    expect(driver.url(key)).toBe(`/uploads/${key}`)

    await driver.delete(key)
    await expect(fs.readFile(path.join(getUploadsDir(), key))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('删除不存在的文件不报错', async () => {
    const driver = getStorageDriver('local')
    await expect(driver.delete('images/1970/01/missing_o.txt')).resolves.toBeUndefined()
  })
})

describe('s3 驱动', () => {
  it('URL 拼接包含前缀且不重复斜杠', () => {
    process.env.S3_BUCKET = 'qingqian'
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com/'
    process.env.S3_PREFIX = 'media'

    expect(getStorageDriver('s3').url('images/2026/09/a_t.webp')).toBe(
      'https://cdn.example.com/media/images/2026/09/a_t.webp'
    )
  })

  it('未设置前缀时直接拼接', () => {
    process.env.S3_BUCKET = 'qingqian'
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com'
    process.env.S3_PREFIX = ''

    expect(getStorageDriver('s3').url('avatars/2026/09/a_a.webp')).toBe(
      'https://cdn.example.com/avatars/2026/09/a_a.webp'
    )
  })

  it('缺少桶或公开地址时视为未配置', () => {
    delete process.env.S3_BUCKET
    process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com'
    expect(isS3Configured()).toBe(false)

    process.env.S3_BUCKET = 'qingqian'
    expect(isS3Configured()).toBe(true)
  })
})
