import './src/server/env'
import { isProductionRuntime, isTestRuntime } from './src/server/utils/runtimeEnv'

const isTestEnv = isTestRuntime()

import compression from 'compression'
import cookieParser from 'cookie-parser'
import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'fs'
import helmet from 'helmet'
import net from 'net'
import path from 'path'

import { authMiddleware } from './src/server/middleware/auth'
import { csrfMiddleware } from './src/server/middleware/csrf'
import { errorHandler } from './src/server/middleware/errorHandler'
import { globalLimiter } from './src/server/middleware/rateLimit'
import { prisma } from './src/server/prisma'
import { registerAdminGalleryRoutes } from './src/server/routes/admin.galleries.routes'
import { registerAdminKeycapRoutes } from './src/server/routes/admin.keycaps.routes'
import { registerAdminMaintenanceRoutes } from './src/server/routes/admin.maintenance.routes'
import { registerAdminSettingsRoutes } from './src/server/routes/admin.settings.routes'
import { registerAdminStatsRoutes } from './src/server/routes/admin.stats.routes'
import { registerAdminUploadRoutes } from './src/server/routes/admin.uploads.routes'
import { registerAdminUserRoutes } from './src/server/routes/admin.users.routes'
import { registerAuthRoutes } from './src/server/routes/auth.routes'
import { registerConfigRoutes } from './src/server/routes/config.routes'
import { registerGalleriesRoutes } from './src/server/routes/galleries.routes'
import { registerKeycapsRoutes } from './src/server/routes/keycaps.routes'
import { registerMeRoutes } from './src/server/routes/me.routes'
import { registerApiKeyRoutes } from './src/server/routes/apiKeys.routes'
import { registerSetupRoutes } from './src/server/routes/setup.routes'
import { logger } from './src/server/utils/logger'
import { getUploadsDir } from './src/server/utils/uploadsPath'

const app = express()
app.set('trust proxy', 1)

const DEFAULT_PORT = Number(process.env.PORT) || 3103
const DEFAULT_HMR_PORT = Number(process.env.VITE_HMR_PORT) || 24680
const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, immutable'
// 图片 key 内含随机 id，内容永不变化，可长缓存
const UPLOADS_CACHE_CONTROL = CACHE_CONTROL_IMMUTABLE

async function findAvailablePort(preferredPort: number, host = '0.0.0.0'): Promise<number> {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const tester = net.createServer()
      tester.once('error', () => resolve(false))
      tester.once('listening', () => {
        tester.close(() => resolve(true))
      })
      tester.listen(port, host)
    })
    if (available) return port
  }
  throw new Error(`No available port in range ${preferredPort}-${preferredPort + 19}`)
}

app.get('/healthz', async (_req, res) => {
  let dbStatus = 'ok'
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    dbStatus = 'error'
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || 'unknown',
    db: dbStatus,
  })
})

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        // 开发环境 Vite 会注入内联 React Refresh 预置脚本
        'script-src': isProductionRuntime()
          ? ["'self'"]
          : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'font-src': ["'self'", 'data:'],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'", ...(isProductionRuntime() ? [] : ['ws:', 'wss:'])],
        'worker-src': ["'self'", 'blob:'],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
      },
    },
  })
)
app.use(compression())
// 只对 API 限流：静态资源与开发态模块请求不应计入配额
app.use('/api', globalLimiter)
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))
app.use(cookieParser())

app.use(authMiddleware)
app.use(csrfMiddleware)

// 上传文件静态服务：必须在 API 路由与 SPA fallback 之前
app.use(
  '/uploads',
  express.static(getUploadsDir(), {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('Cache-Control', UPLOADS_CACHE_CONTROL),
  })
)
app.use('/uploads', (_req, res) => {
  res.status(404).end()
})

registerSetupRoutes(app)
registerConfigRoutes(app)
registerAuthRoutes(app)
registerApiKeyRoutes(app)
registerMeRoutes(app)
registerGalleriesRoutes(app)
registerKeycapsRoutes(app)
registerAdminGalleryRoutes(app)
registerAdminKeycapRoutes(app)
registerAdminUploadRoutes(app)
registerAdminUserRoutes(app)
registerAdminSettingsRoutes(app)
registerAdminStatsRoutes(app)
registerAdminMaintenanceRoutes(app)

// 未匹配的 API 路径返回 JSON 404，避免被 SPA 壳吞掉
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

const SPA_FALLBACK_PATH = /^\/(?!api\/|uploads\/|healthz).*/

async function startServer(): Promise<void> {
  const isProduction = isProductionRuntime()
  const port = await findAvailablePort(DEFAULT_PORT)

  if (port !== DEFAULT_PORT) {
    logger.warn({ requestedPort: DEFAULT_PORT, actualPort: port }, 'Preferred port is busy')
  }

  if (!isProduction) {
    const hmrPort = await findAvailablePort(DEFAULT_HMR_PORT, '127.0.0.1')
    // vite 只在开发依赖里，生产镜像不安装，必须动态导入
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        strictPort: false,
        hmr: { host: '127.0.0.1', port: hmrPort, clientPort: hmrPort },
      },
      appType: 'custom',
    })

    app.use(vite.middlewares)
    app.get(SPA_FALLBACK_PATH, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const htmlPath = path.join(process.cwd(), 'index.html')
        const rawHtml = await fs.promises.readFile(htmlPath, 'utf-8')
        const html = await vite.transformIndexHtml(req.originalUrl, rawHtml)
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.status(200).send(html)
      } catch (error) {
        vite.ssrFixStacktrace(error as Error)
        next(error)
      }
    })
  } else {
    const distDir = path.join(process.cwd(), 'dist')
    // 带 hash 的构建产物可长缓存，其余静态文件（robots.txt、图标等）短缓存
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), {
        index: false,
        fallthrough: true,
        setHeaders: (res) => res.setHeader('Cache-Control', CACHE_CONTROL_IMMUTABLE),
      })
    )
    app.use(express.static(distDir, { index: false, maxAge: '1h' }))
    app.get(SPA_FALLBACK_PATH, (_req: Request, res: Response) => {
      fs.readFile(path.join(distDir, 'index.html'), 'utf-8', (err, html) => {
        if (err) {
          res.status(500).send('Internal Server Error')
          return
        }
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.send(html)
      })
    })
  }

  app.use(errorHandler)

  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Server running on http://localhost:${port}`)
  })

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Starting graceful shutdown')
    server.close(() => {
      prisma
        .$disconnect()
        .catch((error) => logger.error({ err: error }, 'Prisma disconnect failed'))
        .finally(() => process.exit(0))
    })
    setTimeout(() => {
      logger.warn('Forced shutdown after timeout')
      process.exit(1)
    }, 10_000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

if (!isTestEnv) {
  // 单个未处理的 rejection 不应打挂全站
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'Unhandled promise rejection')
  })
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception, exiting')
    process.exit(1)
  })

  startServer().catch((error) => {
    logger.error({ err: error }, 'Failed to start server')
    process.exit(1)
  })
} else {
  app.use(errorHandler)
}

export { app, prisma }
