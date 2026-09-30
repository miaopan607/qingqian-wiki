import { defineConfig, defineProject } from 'vitest/config'
import dotenv from 'dotenv'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 测试环境变量必须在导入被测模块前进入 process.env
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true, quiet: true })

const testUploadsPath =
  process.env.UPLOADS_PATH || path.join(os.tmpdir(), 'qingqian-wiki-test-uploads')
process.env.UPLOADS_PATH = testUploadsPath

const sharedTestConfig = {
  env: {
    NODE_ENV: 'test',
    UPLOADS_PATH: testUploadsPath,
  },
  testTimeout: 30000,
}

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
  test: {
    projects: [
      defineProject({
        resolve: { alias: { '@': path.resolve(__dirname, '.') } },
        test: {
          ...sharedTestConfig,
          name: 'unit-node',
          environment: 'node',
          setupFiles: ['./tests/unit/setup.ts'],
          include: ['tests/unit/**/*.test.ts'],
        },
      }),
      defineProject({
        resolve: { alias: { '@': path.resolve(__dirname, '.') } },
        test: {
          ...sharedTestConfig,
          name: 'unit-jsdom',
          environment: 'jsdom',
          setupFiles: ['./tests/unit/setup.ts', './tests/unit/setup-jsdom.ts'],
          include: ['tests/unit/**/*.test.tsx'],
        },
      }),
    ],
  },
})
