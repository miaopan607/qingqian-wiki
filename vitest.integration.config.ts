import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true, quiet: true })

const testUploadsPath = path.join(os.tmpdir(), 'qingqian-wiki-test-uploads')
process.env.UPLOADS_PATH = testUploadsPath
process.env.NODE_ENV = 'test'
process.env.CHECK_IN_DEV_TIME = ''

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    // 共用一个测试库，串行执行避免相互清库
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
