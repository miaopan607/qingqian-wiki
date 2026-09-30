# 清浅 Wiki

清浅老师的美图与键帽开团档案站：公开浏览图集与键帽，注册用户可点赞、收藏并维护自己的资料，管理员在后台维护全部内容。

## 功能概览

- **美图**：图集（标题 + 描述 + 多张图），列表卡片、详情图片网格与灯箱大图浏览，登录后点赞与收藏。
- **键帽**：按开团序号排列的档案条目（序号 + 名称 + 描述 + 多张图片，图片单独建表）。
- **账户**：注册即用（无邮箱验证），个人中心可改昵称、简介与头像，查看收藏；忘记密码由管理员在后台重置。
- **后台**：仪表盘、美图管理、键帽管理、用户管理（超级管理员）、站点设置（站点名/注册开关/存储驱动/清理未引用图片）。
- **图片**：上传即生成原图 + 详情图（最长边 2400 webp）+ 缩略图（宽 720 webp）与 blurhash 占位；默认存服务器本地磁盘，可选 S3 兼容对象存储。

## 技术栈

| 层级 | 技术                                                     |
| ---- | -------------------------------------------------------- |
| 前端 | React 19、TypeScript、Vite、React Router、Tailwind CSS 4 |
| 后端 | Node.js 22、Express 5、Zod、JWT Cookie、CSRF 双提交      |
| 数据 | PostgreSQL 16、Prisma 6                                  |
| 图片 | multer、sharp、blurhash、本地磁盘 / S3 兼容对象存储      |
| 测试 | Vitest、Testing Library、Supertest                       |
| 部署 | Docker、Docker Compose                                   |

## 快速开始

环境要求：Node.js 22+、npm、PostgreSQL 16+。

```bash
npm install
cp .env.example .env          # 至少填写 DATABASE_URL 与 JWT_SECRET（≥32 字符）
createdb qingqian_wiki        # 或用 psql: CREATE DATABASE qingqian_wiki
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

默认访问地址 <http://localhost:3103>。数据库为空时，首次打开会进入 `/setup` 创建超级管理员（第一个账号自动成为超级管理员）。

## 常用脚本

| 命令                       | 用途                                   |
| -------------------------- | -------------------------------------- |
| `npm run dev`              | 启动开发服务（Express + Vite 中间件）  |
| `npm run build`            | 构建前端产物到 `dist/`                 |
| `npm start`                | 以生产模式启动（需先 `npm run build`） |
| `npm run lint`             | TypeScript 类型检查                    |
| `npm run format`           | Prettier 格式化                        |
| `npm run test:unit`        | 单元测试                               |
| `npm run test:db:init`     | 初始化集成测试库 `qingqian_wiki_test`  |
| `npm run test:integration` | 集成测试（需先执行 `test:db:init`）    |
| `npm run verify`           | 依次执行类型检查、单测、集成测试与构建 |
| `npm run db:migrate`       | 开发环境执行迁移                       |
| `npm run db:deploy`        | 生产环境应用迁移                       |

## 部署

推荐 Docker Compose（应用 + PostgreSQL）：

```bash
cp .env.example .env          # 填写 JWT_SECRET、POSTGRES_PASSWORD 等
docker compose up -d --build
curl http://127.0.0.1:3103/healthz
```

图片默认保存在 Docker 命名卷 `uploads_data`（容器内 `/app/uploads`），数据库数据在 `postgres_data` 卷中。若希望直接在宿主机读写图片文件，改用宿主目录挂载：

```yaml
volumes:
  - ./uploads:/app/uploads # 需先执行 chown -R 1001:1001 ./uploads
```

常用运维命令：`docker compose logs -f app`、`docker compose exec postgres pg_dump -U qingqian qingqian_wiki > backup.sql`。

对外建议用 Nginx 反代并配置 HTTPS：

```nginx
server {
  listen 443 ssl;
  server_name wiki.example.com;

  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:3103;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

对象存储为可选项：在 `.env` 中填齐 `S3_*` 后，可在后台「站点设置」把存储驱动切换为对象存储（只影响新上传，历史图片仍按上传时的驱动访问）。

## 项目结构

```text
src/pages/               前台页面
src/pages/admin/         后台页面
src/components/          可复用组件（ui/ 为内部设计系统）
src/context/             全局状态（认证、主题）
src/lib/                 前端请求层与工具
src/server/routes/       Express 业务路由
src/server/middleware/   认证、CSRF、限流、上传、错误处理
src/server/services/     存储驱动、图片处理、媒体资产、站点配置
prisma/                  数据模型、迁移与种子
tests/                   单元测试与集成测试
```

数据结构以 `prisma/schema.prisma` 为准。更多约定见 `AGENTS.md`。

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 发布，Copyright 2026 淼畔。
