# AGENTS.md

## 项目概况

- 清浅 Wiki：单包全栈应用，React SPA + Express API，Node.js 22（ESM）+ PostgreSQL + Prisma。
- 入口：服务端 `server.ts`；前端路由 `src/App.tsx`；后台路由 `src/pages/admin/AdminRoutes.tsx`。
- 信息冲突时以配置文件为准：`package.json` > `tsconfig.json` > `prisma/schema.prisma` > `.env.example` > `server.ts` > `vite.config.ts`。

## 代码组织

- 前端：`src/pages/`（路由页面，全部懒加载）、`src/components/`（可复用组件）、`src/components/ui/`（内部设计系统）、`src/context/`、`src/hooks/`、`src/lib/`、`src/types/`。
- 后端：`src/server/routes/`（按领域拆分）、`middleware/`（认证、CSRF、限流、上传、错误处理）、`schemas/`（zod 校验）、`services/`（存储驱动、图片处理、媒体资产、站点配置）、`utils/`（日志、密码、响应转换）。

## 前端硬约束

- 网络请求一律走 `src/lib/apiClient.ts`，不直接写 `fetch`；GET 自带去重缓存，写请求自动附带 CSRF 头。
- UI 组件只从 `@/src/components/ui`（或相对路径的 `components/ui`）导入；颜色只用 `src/index.css` 的 token（如 `bg-paper`、`text-ink`、`bg-accent`），不写颜色字面量。
- UI 组件透传原生属性、`className` 与 `ref`，不读业务 Context、不发网络请求。
- 站点级状态放 `src/context/`，页面级数据用 `src/hooks/useAsyncData.ts`。

## 后端硬约束

- 路由处理器顺序：参数提取（`readParam`）→ zod 校验（`validateBody` / `validateQuery`）→ 权限判断（`requireAuth` / `requireActiveUser` / `requireAdmin` / `requireSuperAdmin`）→ 查询或写库 → transformer 输出 → 清理缓存。
- 管理接口一律挂 `requireAdmin`，用户与站点设置挂 `requireSuperAdmin`。
- 数据库访问只用 Prisma；图片文件只经 `services/storage` 驱动读写，不直接 `fs` 落盘。
- 错误统一抛 `src/server/utils/appError.ts` 的类型（带 `statusCode`），由 `errorHandler` 中间件映射为响应。

## 数据与类型同步

- 数据结构以 `prisma/schema.prisma` 为准；改 schema 后运行迁移并重新生成 Prisma Client，再同步 `src/types/*` 与响应 transformer。
- 前端 API 类型在 `src/types/api.ts`，实体类型在 `src/types/entities.ts`，接口变更后同步更新。

## 编码规范

- 格式以 `.prettierrc` 为准（单引号、无分号、printWidth 100）；路径别名 `@/*`。
- 命名：组件文件与导出 PascalCase，工具函数 camelCase，路由文件 `*.routes.ts`，Prisma 模型 PascalCase。
- 注释用中文，说明代码做什么，避免逐行翻译。
- 复用优先：先查 `src/components/ui`、`src/lib`、`src/server/services` 是否已有实现。

## 测试与验证

- 命令：`npm run dev` / `lint` / `test:unit` / `test:db:init` + `test:integration` / `build` / `verify`。
- 单元测试在 `tests/unit/`（`.test.ts` 走 node 环境，`.test.tsx` 走 jsdom）；集成测试在 `tests/integration/`，直打 `app` 并共用测试库 `qingqian_wiki_test`。
- 集成测试改库后若涉及站点配置，需调用 `setRegistrationOpen()` / `seedSiteConfig()` 之类的辅助函数，它们会失效 5 秒配置缓存。
- 测试只覆盖行为与权限边界，不测实现细节与字段形状。
- 完成前执行 `npm run format && npm run verify`。
