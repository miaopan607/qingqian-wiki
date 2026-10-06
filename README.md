# 清浅 Wiki

清浅老师的美图与键帽开团档案站：公开浏览图集与键帽，注册用户可点赞、收藏并维护自己的资料，管理员在后台维护全部内容。

## 功能概览

- **美图**：图集（标题 + 描述 + 多张图），前台列表与详情图片以瀑布流展示，支持灯箱大图浏览，登录后点赞与收藏。
- **键帽**：按开团序号排列的档案条目（序号 + 名称 + 描述 + 多张图片，图片单独建表）。
- **账户**：注册即用（无邮箱验证），个人中心可改昵称、简介与头像、查看收藏和管理 API 密钥；忘记密码由管理员在后台重置，密码重置会使旧 API 密钥失效。
- **后台**：仪表盘、美图管理、键帽管理、用户管理（超级管理员）、站点设置（站点名/注册开关/存储驱动/清理未引用图片）。
- **图片**：上传即生成原图 + 详情图（最长边 2400 px，WebP）+ 缩略图（最长边 720 px，WebP）与 blurhash 占位；灯箱主图加载原图，底部 48 × 48 px 图片使用缩略图；默认存服务器本地磁盘，可选 S3 兼容对象存储。
- **签到**：北京时间2026年10月7日05:00至11月6日05:00的30天活动，Cloudflare Turnstile保护每日签到；结束后公示排名，后台可按需查看汇总及逐人明细。

## 签到活动

前台入口为`/check-in`，管理后台入口为`/admin/check-in`。每个签到日从北京时间05:00开始，到次日05:00前结束，不可补签；完成全部30天才参与获奖排名。以服务端验证完成时间按秒计分，当日06:00记06:00、次日01:00记25:00；平均延长时钟时间越早排名越高，并列第一共同获得“活动奖励”，由管理员人工发奖。11月6日05:00起游客可查看最终榜单。

部署前在Cloudflare创建Turnstile widget并允许实际站点域名，在`.env`配置`TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`与`TURNSTILE_HOSTNAMES`（逗号分隔，不含协议、端口或路径）。修改后重启服务；三项缺失或无效时签到失败封闭，其他站点功能正常。secret仅留在服务端；开发可允许localhost，生产不要使用测试密钥。

后台仅未封禁管理员可读，显示当前加载时的参与人数、每日签到人数、进度、漏签、平均时间和30天逐日记录。打开、搜索、筛选、翻页或点击“刷新”时获取新情况；不自动刷新，也不提供补签、修改成绩或删除记录。活动期间后台明细不解锁前台榜单。

## API 接入

所有账户可在“个人中心 → API 接入”创建个人密钥。完整接口契约、权限范围、错误码、限流和管理员 curl 示例见 [API 接入文档（Markdown）](public/api.md)；部署后该文档也可从网站资源 [`/api.md`](/api.md) 访问。

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

镜像由 GitHub Actions 在推送 `main`（或打 `v*` 标签、手动触发）时自动构建并推送到 GHCR：`ghcr.io/miaopan607/qingqian-wiki:latest`。服务器只需拉取运行。

### 一键部署（推荐）

```bash
mkdir -p /opt/qingqian-wiki && cd /opt/qingqian-wiki
curl -fsSL https://raw.githubusercontent.com/miaopan607/qingqian-wiki/main/scripts/deploy-docker.sh -o deploy-docker.sh
bash deploy-docker.sh
```

脚本会：生成 `.env`（随机 `JWT_SECRET` 与数据库口令）→ 缺 `docker-compose.yml` 时从仓库下载 → 拉取镜像 → `docker compose up -d` → 等待 `/healthz`。**首次部署后立刻访问 `/setup` 创建超级管理员**，否则任何人访问站点都能抢注。

常用覆盖项：

```bash
APP_PORT=8080 bash deploy-docker.sh     # 换端口
BUILD=1 bash deploy-docker.sh           # 在源码目录本地构建，不走镜像
PULL=0 bash deploy-docker.sh            # 用服务器上已有的镜像
IMAGE=ghcr.io/miaopan607/qingqian-wiki:sha-abc1234 bash deploy-docker.sh   # 固定版本
```

### 国内服务器 / 不连 Docker Hub 与 GitHub

国内直连 Docker Hub 会卡在拉取基础镜像元数据，典型报错：

```text
failed to resolve source metadata for docker.io/library/node:22-bookworm-slim:
dial tcp 104.244.46.211:443: i/o timeout
```

用镜像源地址覆盖基础镜像与各上游源即可绕开（四个变量各解决一处外网依赖）：

```bash
git clone https://github.com/miaopan607/qingqian-wiki.git
cd qingqian-wiki

NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim \
POSTGRES_IMAGE=docker.m.daocloud.io/library/postgres:16-alpine \
NPM_REGISTRY=https://registry.npmmirror.com \
DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn \
BUILD=1 bash scripts/deploy-docker.sh
```

| 变量             | 解决的问题                                                            |
| ---------------- | --------------------------------------------------------------------- |
| `NODE_IMAGE`     | 构建阶段 Node 基础镜像（默认 `node:22-bookworm-slim`，走 Docker Hub） |
| `POSTGRES_IMAGE` | 数据库镜像（默认 `postgres:16-alpine`，走 Docker Hub）                |
| `NPM_REGISTRY`   | 构建期 `npm ci` 依赖源（默认官方 npm 源）                             |
| `DEBIAN_MIRROR`  | 构建期 `apt-get` 的 Debian 源域名（默认 `deb.debian.org`）            |

镜像源地址会随时间失效，先用下面命令挑一个可用的（任一显示 OK 即可用）：

```bash
for m in docker.m.daocloud.io docker.1ms.run hub.rat.dev dockerproxy.net; do
  docker pull -q "$m/library/hello-world:latest" >/dev/null 2>&1 && echo "$m OK" || echo "$m FAIL"
done
```

等效替代：在 `/etc/docker/daemon.json` 配置 `registry-mirrors` 后 `systemctl restart docker`，这样默认镜像名也会走加速。

源码若也拉不动：本地克隆后打包上传（构建只用工作目录里的源码与 `Dockerfile`）：

```bash
tar --exclude=node_modules --exclude=.git --exclude=dist -czf qingqian-wiki.tgz .
scp qingqian-wiki.tgz root@<服务器>:/opt/
# 服务器上：tar -xzf qingqian-wiki.tgz -C /opt/qingqian-wiki && cd /opt/qingqian-wiki
```

不改脚本、手动构建也可以：`cp .env.example .env`（填 `JWT_SECRET`（≥32 字符）与 `POSTGRES_PASSWORD`）→ `docker compose up -d --build` → `curl http://127.0.0.1:3103/healthz`。

本仓库为公开仓库，镜像包随之公开：服务器**无需登录**即可 `docker pull`（实测匿名拉取成功）。如果你手动把包改成了私有，则需先登录：`echo "<带 read:packages 的 PAT>" | docker login ghcr.io -u <GitHub 用户名> --password-stdin`。

### 运维

```bash
docker compose logs -f app                     # 日志
docker compose pull app && docker compose up -d  # 升级到最新镜像（启动时自动迁移）
docker compose exec postgres pg_dump -U qingqian qingqian_wiki > backup.sql   # 备份数据库
```

图片默认保存在命名卷 `uploads_data`（容器内 `/app/uploads`），数据库数据在 `postgres_data` 卷中。若希望直接在宿主机读写图片文件，改用宿主目录挂载：

```yaml
volumes:
  - ./uploads:/app/uploads # 需先执行 chown -R 1001:1001 ./uploads
```

单张图片上传上限通过 `.env` 的 `UPLOAD_MAX_FILE_SIZE_MB` 配置，默认 `20`，
单位为 MiB（1 MiB = 1024 × 1024 字节），仅接受正整数；留空或无效值使用默认值。
例如 `UPLOAD_MAX_FILE_SIZE_MB=50` 表示允许单张图片最多 50 MiB，前端自动读取服务端上限。
修改后重启服务；Docker Compose 部署需运行 `docker compose up -d --force-recreate app`。
Nginx 的 `client_max_body_size` 需略大于文件上限，为 multipart 请求体留出空间；
提高上限也会增加上传时的内存占用。

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
