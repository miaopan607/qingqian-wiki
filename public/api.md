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

图集 `title` 创建时必须传字符串，允许传 `""`；首尾空白会被去除，空白名称保存为空字符串。名称为空时不显示标题，序号仍显示。更新时省略 `title` 保持原名称，传 `""` 可清空名称。

上传仅接受可解码的 JPG、PNG、WebP、GIF、BMP 图片，单文件最大 20 MiB。上传响应中的资产 `id` 用于创建或更新图集的 `assetIds`。

图集与键帽详情的 `images` 中，`id` 表示内容图片关联记录，`assetId` 表示媒体资产。编辑已有图片时，按期望顺序提交 `assetId` 数组作为 `assetIds`，不要提交关联记录的 `id`；数组顺序决定保存后的图片顺序。

### 密钥失效与账户状态

密码重置会立即使该用户所有旧密钥失效；封禁账户无法调用密钥。解除封禁后，仍未撤销、未过期且密码未再次改变的密钥可以继续使用。撤销立即生效。永久密钥不会自动到期，泄露后须手动撤销。

## 签到活动（登录会话）

以下接口仅支持登录Cookie会话，不接受Bearer API密钥。所有写请求需要`X-XSRF-TOKEN`；用户签到还必须通过Cloudflare Turnstile。全部接口支持`eventId`查询参数，缺省为`2026-11-22`，旧活动为`2026-10-07`；未知活动返回404 `CHECK_IN_EVENT_NOT_FOUND`。旧活动已归档，普通用户写入返回409 `CHECK_IN_ARCHIVED`，管理员仍可更正。

本期为北京时间2026年11月22日至12月22日。用户首次确认每日刷新分钟`0..1439`，从11月22日该时刻起至12月22日同一时刻止，共30个签到日（`dayIndex=0..29`）。确认后本人不能修改，包括重复提交同值；清空微信、重新登录均不解锁。允许活动中首次设点，不补建过去记录。签满全部30天的用户均有机会获得奖励，排名靠前的用户可能另外获得奖励，具体细则以清浅安排为准。

| 方法   | 路径                                                      | 说明                                                                                                                                                                   |
| ------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/check-in`                                           | 游客可读`event/events/serverNow/phase/dayIndex/nextTransitionAt/turnstileSiteKey`；登录者另有`me`。已设点按个人窗口，未设点或游客按全局阶段且`dayIndex=null`           |
| PUT    | `/api/check-in/refresh-time`                              | 严格请求`{ refreshMinute: 整数 }`，成功返回最新状态；已锁定409 `CHECK_IN_REFRESH_LOCKED`，个人截止已到409 `CHECK_IN_ENDED`                                             |
| PUT    | `/api/check-in/wechat`                                    | 请求`{ wechat: string或null }`；最多30个字母、数字、下划线或连字符，空串也清空；仅更新微信，不删除档案、不继承其他活动微信                                             |
| POST   | `/api/check-in`                                           | 请求`{ turnstileToken, dayIndex }`；首次成功201 `{ record }`，重复409且不覆盖首次时间；未设点409 `CHECK_IN_REFRESH_REQUIRED`                                           |
| GET    | `/api/check-in/rankings`                                  | 公示前403，公示后游客可读；`page`默认1、`pageSize`默认24且最大100                                                                                                      |
| GET    | `/api/admin/check-in`                                     | 未封禁管理员读取快照，支持`q`（昵称不区分大小写包含匹配或完整UID）、`state=in_progress/missed/completed`及分页                                                         |
| GET    | `/api/admin/check-in/participants/:uid`                   | 管理员读取完整用户明细，真实零签到或未设点用户也可查；不存在404                                                                                                        |
| PUT    | `/api/admin/check-in/participants/:uid/records/:dayIndex` | 管理员补录或改时间：`{ checkedInAt: 带时区ISO, reason?: string }`，整秒存储，必须在目标个人窗口内且不晚于活动时钟；分数由服务端计算                                    |
| DELETE | `/api/admin/check-in/participants/:uid/records/:dayIndex` | 管理员撤销：`{ reason?: string }`，缺失404 `CHECK_IN_RECORD_NOT_FOUND`                                                                                                 |
| PATCH  | `/api/admin/check-in/participants/:uid/profile`           | 管理员更正`{ wechat?: string或null, refreshMinute?: 整数, reason?: string }`，至少一个资料字段；已设点则仅追加未来刷新变更，无未来边界409 `CHECK_IN_NO_FUTURE_REFRESH` |
| GET    | `/api/admin/check-in/logs`                                | 管理员查看按`createdAt desc,id desc`分页的日志，选填`userUid`限定目标；无修改/删除接口                                                                                 |

`event`包含`id/debug/archived/startsOn/endsOn/startsAt/endsAt/rankingsAvailableAt/days/fixedRefreshMinute/scoreMode/rewardMode`。本期个人刷新，`scoreMode=elapsed`、`rewardMode=possible`；全局开始北京时间11月22日00:00，公示及全局结束12月22日23:59，不能用全局阶段替代个人阶段。旧活动为北京时间10月7日05:00至11月6日05:00、固定刷新分钟300、`extended_clock/first_place`。

`record={ dayIndex, checkedInAt, scoreSeconds }`，所有时间戳为UTC ISO。新活动按个人窗口起点后整秒耗时计分，允许0秒；旧活动保留延长时钟，06:00为21600秒、次日01:00为90000秒。完整者按整数总分排名，并列为1、1、3，UID稳定排序；公开响应为`items/total/page/pageSize/qualifiedTotal`，未签满者`rank/averageTimeSeconds=null`。本期`winner`始终为null，不自动判断奖励；旧活动并列第一true、其他false。不同活动成绩、微信和搜索统计完全隔离。

`me`含`records/completedDays/averageTimeSeconds/eligible/wechat/phase/dayIndex/dayStartsAt/nextTransitionAt/initialRefreshMinute/refreshMinute/refreshChanges/dayWindows/missedDayIndexes`。`initialRefreshMinute`保留最初确认值，未设点为null且本期`dayWindows=[]`；`refreshMinute`为当前实际生效分钟。每个窗口为`{ dayIndex, startsAt, endsAt, refreshMinute }`，起点含、截止不含；变更历史为`{ id, fromDayIndex, refreshMinute, createdAt }`，最大ID覆盖同一未来边界的安排。管理员改点只影响操作时刻之后的边界，交接日可缩短/延长，窗口连续，不增加第31次签到，不修改已有签到日期、时间和分数，也不重开已结束的个人活动。

后台响应为`event/snapshotAt/phase/summary/daily/items/total/page/pageSize`，无顶层`dayIndex`。`daily`固定30项`{ dayIndex, checkIns, phase }`，本期按各用户个人日索引统计，阶段按可选分钟包络。`summary.todayCheckIns`统计各用户“自己的当前日已签人数”，全局未开始/结束为null。列表包含有本活动记录或本期已设点用户，仅填微信不算参与；零记录均值为null。每人明细含个人窗口、刷新历史、已结束且未签的日索引、状态及全榜名次。搜索/状态筛选只影响items/total，未来记录不计当前快照，公示前rank=null。

管理员写入及对应审计日志在同一档案行锁事务中提交，日志失败全部回滚。原因选填、trim后最多500字，空值存null。完全无实际变更不写日志。日志保存当时真实操作者/目标UID及昵称、活动ID、`action=record_set/record_delete/profile_update`、原因、真实审计时间和结构化before/after；记录操作为`{ record: 记录或null }`，资料操作为`{ wechat, initialRefreshMinute, refreshChanges }`。删除用户不会删除既有日志。

开发环境设置`CHECK_IN_DEV_TIME`时，响应debug=true，两个活动使用`dev-2026-11-22`和`dev-2026-10-07`，仅查询开发ID，不读写正式数据；前端使用响应中的ID。非调试模式不接受dev ID。模拟时钟只影响活动判断，不影响审计时间、认证或验证token有效期；生产/自动测试禁止设置此参数。

所有状态与后台响应禁止HTTP缓存，后台需重新加载获取更正后的统计。其他主要错误码：400 `CHECK_IN_INVALID_TIME` / `TURNSTILE_FAILED`，403 `CHECK_IN_RANKINGS_HIDDEN`，409 `CHECK_IN_NOT_STARTED` / `CHECK_IN_ENDED` / `CHECK_IN_ALREADY_DONE` / `CHECK_IN_DAY_CHANGED`，503 `TURNSTILE_NOT_CONFIGURED` / `TURNSTILE_UNAVAILABLE`。失败写入不会产生成功日志。

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
