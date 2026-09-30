import fs from 'fs/promises'
import path from 'path'
import { getUploadsDir } from '../../utils/uploadsPath'
import type { StorageDriver } from './types'

// 本地磁盘驱动：文件写入 UPLOADS_PATH，经 /uploads 静态路由对外提供
export const localDriver: StorageDriver = {
  id: 'local',

  async put(key, body) {
    const target = path.join(getUploadsDir(), key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body)
  },

  async delete(key) {
    try {
      await fs.unlink(path.join(getUploadsDir(), key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  },

  url(key) {
    return `/uploads/${key}`
  },
}
