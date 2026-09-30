import fs from 'fs'
import path from 'path'

let cachedUploadsDir: string | null = null

// 上传根目录：本地磁盘驱动与 /uploads 静态服务共用
export function getUploadsDir(): string {
  if (cachedUploadsDir) return cachedUploadsDir

  const dir = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads')
  fs.mkdirSync(dir, { recursive: true, mode: 0o755 })
  cachedUploadsDir = dir
  return dir
}
