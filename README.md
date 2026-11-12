# 清浅 Wiki

清浅老师的美图与键帽开团档案站：公开浏览图集与键帽，注册用户可点赞、收藏并维护自己的资料，管理员在后台维护全部内容。

## 功能概览

- **美图**：图集（标题 + 描述 + 多张图），前台列表与详情图片以瀑布流展示，支持灯箱大图浏览，登录后点赞与收藏。
- **键帽**：按开团序号排列的档案条目（序号 + 名称 + 描述 + 多张图片，图片单独建表）。
- **账户**：注册即用（无邮箱验证），个人中心可改昵称、简介与头像、查看收藏和管理 API 密钥；忘记密码由管理员在后台重置，密码重置会使旧 API 密钥失效。
- **后台**：仪表盘、美图管理、键帽管理、用户管理（超级管理员）、站点设置（站点名/注册开关/存储驱动/清理未引用图片）。
- **图片**：上传即生成原图 + 详情图（最长边 2400 px，WebP）+ 缩略图（最长边 720 px，WebP）与 blurhash 占位；灯箱主图加载原图，底部 48 × 48 px 图片使用缩略图；默认存服务器本地磁盘，可选 S3 兼容对象存储。
- **签到**：北京时间2026年11月22日至12月22日的个人30天活动，分钟级刷新时间首次确认锁定，按刷新后平均耗时排名；旧活动归档保留，管理员可事务更正并留存审计日志。

## 签到活动

前台入口为`/check-in`，管理后台入口为`/admin/check-in`。本期用户选择北京时间每日刷新分钟，从11月22日该时刻到12月22日同一时刻共30个签到日，首次确认后本人不能修改，不可自行补签。按服务端验证完成时刻相对个人窗口起点的整秒耗时计分，签满30天者按整数总分排名，并列为1、1、3。签满全部30天的用户均有机会获得奖励，排名靠前的用户可能另外获得奖励，具体细则以清浅安排为准。所有人结束后，即北京时间12月22日23:59公示榜单。页面底部“历史活动”链接保留10月活动、旧延长时钟成绩与旧获奖结论。

部署前在Cloudflare创建Turnstile widget并允许实际站点域名，在`.env`配置`TURNSTILE_SITE_KEY`、`TURNSTILE_SECRET_KEY`与`TURNSTILE_HOSTNAMES`（逗号分隔，不含协议、端口或路径）。修改后重启服务；三项缺失或无效时签到失败封闭，其他站点功能正常。secret仅留在服务端；开发可允许localhost，生产不要使用测试密钥。

后台仅未封禁管理员可访问，可切换新旧活动、查看快照汇总和逐日明细，通过完整UID打开零签到用户，补录、改时间、撤销或修改微信。管理员改刷新时间仅追加未来边界安排，交接日可能缩短或延长，已有记录与分数保持不变。每次实际修改与审计日志在同一行锁事务内提交，原因选填；日志保留当时身份、真实时间及结构化前后值，用户删除不会清除日志。统计与日志修改后重新请求，不手工加减；后台不提前解锁公开榜单。接口字段详见`public/api.md`。

### 活动开始前本地验收

在Cloudflare创建开发用Turnstile widget，允许`localhost`，并在项目根目录`.env.local`填写真实开发密钥：

```dotenv
TURNSTILE_SITE_KEY="开发组件的Site key"
TURNSTILE_SECRET_KEY="开发组件的Secret key"
TURNSTILE_HOSTNAMES="localhost"
CHECK_IN_DEV_TIME="2026-11-22T05:00:00+08:00"
```

使用`npm run dev`启动并访问`http://localhost:3103/check-in`（以终端实际端口为准）。签到活动时钟从配置时间开始随真实经过时长推进，登录、CSRF及Cloudflare仍使用真实时间；页面标明“本地调试活动”。此配置不跳过验证，只有浏览器真实完成挑战并经服务端验票成功后才写入记录。

验收步骤：登录未封禁账号→选择刷新分钟→确认警告并锁定→完成挑战并签到→刷新仍显示已签→管理员打开`/admin/check-in`手动查看、更正并检查操作日志。调试活动分别使用`dev-2026-11-22`和`dev-2026-10-07`，不读写正式活动，前后端入口采用响应中的ID。再次验收同一天可使用另一个测试账号；下一天可将配置推进至`2026-11-23T05:00:00+08:00`后重启。部署使用增量迁移，不重建或清空旧记录。

验收后删除`CHECK_IN_DEV_TIME`或设为空，再重启开发服务，恢复真实活动时钟和正式活动数据。只能在开发环境使用；生产或自动测试环境设置非空值会拒绝启动。不要改电脑时间，不要将开发密钥或`.env.local`提交到Git。

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
