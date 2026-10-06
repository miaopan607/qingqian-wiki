# 清浅 Wiki API 接入说明

本文档通过本站公开静态资源 `/api.md` 提供，也可从仓库的 `public/api.md` 阅读。

## 开始使用

登录后在“个人中心 → API 接入”创建密钥。权限分为只读、读写；有效期可选 30、90、365 天或永久，默认只读、90 天。每个账户最多同时持有 10 把有效密钥。

创建响应仅显示一次完整密钥，本站不会再次返回；遗失后只能撤销并重新创建。应通过环境变量或秘密管理服务保存，不要将密钥提交到源码、命令历史或客户端网页代码中。

```bash
export BASE="https://wiki.example.com"
export TOKEN="在个人中心创建的完整密钥"

curl -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/galleries?page=1&pageSize=24"
```

脚本通过 `Authorization: Bearer <密钥>` 认证，不需要 Cookie 或 CSRF 头。

## 密钥管理（登录会话）

密钥管理接口必须使用本站登录 Cookie；创建和撤销请求需带现有 `X-XSRF-TOKEN` 头，Bearer 密钥不能调用这些接口。

| 方法     | 路径                   | 成功响应                                                                  |
| -------- | ---------------------- | ------------------------------------------------------------------------- |
| `GET`    | `/api/me/api-keys`     | `{ "items": [密钥元数据, ...] }`                                          |
| `POST`   | `/api/me/api-keys`     | `201 { "apiKey": 密钥元数据, "token": "完整密钥" }`；完整密钥仅返回一次   |
| `DELETE` | `/api/me/api-keys/:id` | `{ "success": true }`；重复撤销仍成功，他人密钥与不存在的 id 均返回 `404` |

创建请求示例：`{ "name": "备份脚本", "scope": "read", "expiresInDays": 90 }`。

- `name` 必填，trim 后 1–50 字符。
- `scope` 可选 `read` / `read_write`，默认 `read`。
- `expiresInDays` 可选 `30`、`90`、`365` 或 `null`（永久），默认 `90`。
- 请求体不接受额外字段。
- 密钥元数据字段：`id`、`name`、`tokenPrefix`、`scope`、`createdAt`、`expiresAt`、`revokedAt`、`status`。`status` 为 `active`、`expired`、`revoked` 或 `invalidated`。
- 读取与创建响应设置 `Cache-Control: no-store`，元数据不包含完整密钥或哈希。

## 可调用接口

| 方法           | 路径                          | 权限与说明                                                                         |
| -------------- | ----------------------------- | ---------------------------------------------------------------------------------- |
| `GET` / `HEAD` | `/api/galleries`              | 已发布图集分页列表；普通用户看不到草稿                                             |
| `GET` / `HEAD` | `/api/galleries/:id`          | 已发布图集详情；普通用户访问草稿返回 `404`                                         |
| `GET` / `HEAD` | `/api/keycaps`                | 键帽分页列表                                                                       |
| `GET` / `HEAD` | `/api/keycaps/:id`            | 键帽详情                                                                           |
| `GET` / `HEAD` | `/api/admin/galleries`        | 仅管理员密钥可访问，可传 `status=draft` 或 `published`                             |
| `GET` / `HEAD` | `/api/admin/galleries/:id`    | 仅管理员密钥可访问，包含草稿                                                       |
| `POST`         | `/api/admin/uploads/images`   | 仅管理员读写密钥；multipart 字段名为 `file`                                        |
| `POST`         | `/api/admin/galleries`        | 仅管理员读写密钥；创建图集，`status` 可选 `draft` 或 `published`，默认 `published` |
| `PATCH`        | `/api/admin/galleries/:id`    | 仅管理员读写密钥；更新任意管理员创建的图集                                         |
| `DELETE`       | `/api/admin/uploads/:assetId` | 仅管理员读写密钥；回滚未引用的上传图片，被引用的图片不会删除                       |

其他管理接口、键帽写入、图集删除、个人资料、点赞收藏与密钥管理接口均不接受 Bearer 密钥。读写权限不会提升账户角色；普通账户的读写密钥仍只能访问公开读取接口。管理员角色变化会立即作用于密钥。

### 分页与图片

列表响应包含 `items`、`total`、`page`、`pageSize`。图集列表每页默认 24 条，键帽列表默认 50 条，后台图集默认 20 条；`pageSize` 最大 100。

图集列表与详情包含唯一序号 `seq`，列表按序号降序排列。创建图集可传 `seq`（1–9999 的整数），省略时使用当前最大序号加一；更新图集可修改 `seq`，序号冲突返回 `409`。后台图集列表还返回 `nextSeq`，用于新建时建议序号。已有图集按创建时间由早到晚补号，同时间按 `id` 升序编号。

上传仅接受可解码的 JPG、PNG、WebP、GIF、BMP 图片，单文件最大 20 MiB。上传响应中的资产 `id` 用于创建或更新图集的 `assetIds`。

图集与键帽详情的 `images` 中，`id` 表示内容图片关联记录，`assetId` 表示媒体资产。编辑已有图片时，按期望顺序提交 `assetId` 数组作为 `assetIds`，不要提交关联记录的 `id`；数组顺序决定保存后的图片顺序。

### 密钥失效与账户状态

密码重置会立即使该用户所有旧密钥失效；封禁账户无法调用密钥。解除封禁后，仍未撤销、未过期且密码未再次改变的密钥可以继续使用。撤销立即生效。永久密钥不会自动到期，泄露后须手动撤销。

## 签到活动（登录会话）

以下接口不接受Bearer API密钥；签到写请求使用登录Cookie及`X-XSRF-TOKEN`，并且必须通过Cloudflare Turnstile。活动为北京时间2026年10月7日05:00至11月6日05:00，每日05:00切日，dayIndex为0至29，不可补签。

| 方法 | 路径                     | 说明                                                                                                                   |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| GET  | `/api/check-in`          | 游客可读规则、服务端时间、阶段及公开site key；登录者额外获得自己的records、completedDays、averageTimeSeconds、eligible |
| POST | `/api/check-in`          | 请求`{ turnstileToken, dayIndex }`；未封禁用户当天首次签到返回201及record，重复签到409，不覆盖首次时间                 |
| GET  | `/api/check-in/rankings` | 结束前403，结束后游客可读；page默认1、pageSize默认24且最大100                                                          |
| GET  | `/api/admin/check-in`    | 未封禁管理员可在全活动期读取加载快照；不需要Turnstile，仅提供读取                                                      |

签到record为`{ dayIndex, checkedInAt, scoreSeconds }`，时间采用UTC ISO字符串，页面转为北京时间。scoreSeconds采用延长时钟：06:00为21600秒，次日01:00为90000秒（25:00）；完成30天者按整数总分排序，用总分判定并列，排名为1、1、3，并列第一winner=true。公示响应包含items、total、page、pageSize、qualifiedTotal；items为用户UID、昵称、已签天数、平均时间、rank与winner。未签满者rank及公开均值为null，不能获奖；无记录账号不入榜。

后台支持q（昵称不区分大小写包含匹配或完整UID）、state（in_progress/missed/completed）及上述分页参数。响应包含snapshotAt、event、phase、dayIndex、全活动summary、固定30项daily和本页items；每人items带全部records及missedDayIndexes。搜索与状态筛选只改变items/total，不改变全活动汇总；今日待签不计漏签，未来记录不计入当前快照。活动期间rank=null、winner=false，结束后沿用全榜名次，搜索不重排名次。接口不公开邮箱、IP、人机验证token或secret；不提供成绩写入管理接口。

签到及后台状态响应均禁止HTTP缓存；后台需手动重新请求获取新情况，不提供推送或自动刷新。主要错误码：

| HTTP | code                                             | 说明                                                       |
| ---- | ------------------------------------------------ | ---------------------------------------------------------- |
| 400  | TURNSTILE_FAILED                                 | token无效、过期、已消费，或action/hostname不符，需重新验证 |
| 403  | CHECK_IN_RANKINGS_HIDDEN                         | 尚未到公示时间                                             |
| 409  | CHECK_IN_NOT_STARTED / CHECK_IN_ENDED            | 不在活动签到期                                             |
| 409  | CHECK_IN_ALREADY_DONE                            | 今日已签到                                                 |
| 409  | CHECK_IN_DAY_CHANGED                             | 验证期间切日，刷新后重新验证                               |
| 503  | TURNSTILE_NOT_CONFIGURED / TURNSTILE_UNAVAILABLE | 未配置或上游不可用，不写入签到                             |

## 错误响应

错误使用 JSON `{ "error": "..." }`，部分认证和权限错误还会带 `code`：

| HTTP 状态 | 错误码                       | 含义                                             |
| --------- | ---------------------------- | ------------------------------------------------ |
| `400`     | —                            | 请求字段或图片不合法；图片超过 20 MiB 返回 `413` |
| `401`     | `API_KEY_INVALID`            | 格式错误、无效、撤销、到期或因密码重置失效的密钥 |
| `403`     | `API_KEY_ENDPOINT_FORBIDDEN` | 路径或方法不在密钥 API 白名单中                  |
| `403`     | `API_KEY_SCOPE_FORBIDDEN`    | 只读密钥尝试执行写操作                           |
| `403`     | `USER_BANNED`                | 账户已封禁                                       |
| `409`     | `API_KEY_LIMIT`              | 已达到每账户 10 把有效密钥上限                   |
| `429`     | —                            | 请求频率超限，请等待后重试                       |

不需要登录的公开读取接口可匿名访问；仅需 Cookie 会话的接口未登录时返回 `401`。

## 限流

API 请求上限为每 IP 每分钟 3000 次；密钥还按账户共享每分钟 3000 次上限。创建或修改图集、回滚上传图片每分钟最多 600 次；图片上传每 10 分钟最多 600 次。响应包含标准 `RateLimit` 限流头。

## 管理员上传并发布图集

先上传图片，使用响应中的 `asset.id` 创建草稿，再发布。以下命令需要管理员读写密钥与 `jq`：

```bash
UPLOAD=$(curl -fsS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./photo.png" \
  "$BASE/api/admin/uploads/images")
ASSET_ID=$(printf '%s' "$UPLOAD" | jq -r '.asset.id')

DRAFT=$(curl -fsS -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"周末拍摄\",\"description\":\"API 创建的图集\",\"status\":\"draft\",\"assetIds\":[\"$ASSET_ID\"]}" \
  "$BASE/api/admin/galleries")
GALLERY_ID=$(printf '%s' "$DRAFT" | jq -r '.gallery.id')

curl -fsS -X PATCH \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"published"}' \
  "$BASE/api/admin/galleries/$GALLERY_ID"
```
