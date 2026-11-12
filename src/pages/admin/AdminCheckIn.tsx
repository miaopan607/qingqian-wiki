import { CalendarCheck, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Pagination } from '../../components/Pagination'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui'
import { useAsyncData } from '../../hooks/useAsyncData'
import { usePagination } from '../../hooks/usePagination'
import { apiGet, apiRequest } from '../../lib/apiClient'
import { useAuth } from '../../context/AuthContext'
import { getCheckInDayWindows, getNextCheckInRefreshChange } from '../../lib/checkInSchedule'
import {
  formatCheckInDateTime,
  formatCheckInScore,
  getCheckInDateLabel,
  getCheckInDayStatus,
} from '../../lib/checkIn'
import { getErrorMessage } from '../../lib/errorHandler'
import type { AdminCheckInResponse, CheckInStatusResponse } from '../../types/api'
import type {
  AdminCheckInParticipant,
  CheckInAuditLogItem,
  CheckInEvent,
  Paginated,
} from '../../types/entities'

const PAGE_SIZE_OPTIONS = [24, 48, 96]
const PHASE_LABEL = { upcoming: '未开始', active: '进行中', ended: '已结束' }
const STATE_LABEL = { in_progress: '进行中', missed: '已漏签', completed: '已签满' }

function AdminCheckInActivity({ eventId }: { eventId?: string }) {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState<'' | AdminCheckInParticipant['state']>('')
  const [total, setTotal] = useState(0)
  const [detail, setDetail] = useState<AdminCheckInParticipant | null>(null)
  const [refreshRequested, setRefreshRequested] = useState(true)
  const [directUid, setDirectUid] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logsUser, setLogsUser] = useState('')
  const [logVersion, setLogVersion] = useState(0)
  const pagination = usePagination({
    total,
    defaultPageSize: 24,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  })

  const snapshot = useAsyncData<AdminCheckInResponse>(
    (signal) =>
      apiGet<AdminCheckInResponse>(
        '/api/admin/check-in',
        {
          eventId,
          page: pagination.page,
          pageSize: pagination.pageSize,
          q: query || undefined,
          state: state || undefined,
        },
        signal
      ),
    [eventId, pagination.page, pagination.pageSize, query, state]
  )

  useEffect(() => {
    if (!snapshot.data) return
    setTotal(snapshot.data.total)
    const lastPage = Math.max(1, Math.ceil(snapshot.data.total / pagination.pageSize))
    if (snapshot.data.page > lastPage) pagination.setPage(lastPage)
  }, [snapshot.data, pagination.pageSize, pagination.setPage])

  useEffect(() => {
    if (!snapshot.loading) setRefreshRequested(false)
  }, [snapshot.loading, snapshot.data, snapshot.error])

  useEffect(() => {
    // URL 前进、后退也不能把旧行明细与新的筛选快照混在一起。
    setDetail(null)
  }, [pagination.page, pagination.pageSize, query, state])

  const refresh = () => {
    setDetail(null)
    setRefreshRequested(true)
    snapshot.reload()
  }

  const data = snapshot.data
  const busy = snapshot.loading || refreshRequested

  const openDetail = async (uid: string) => {
    setEditError(null)
    try {
      setDetail(
        await apiGet<AdminCheckInParticipant>(
          `/api/admin/check-in/participants/${encodeURIComponent(uid)}`,
          { eventId: data?.event.id ?? eventId },
          new AbortController().signal
        )
      )
    } catch (error) {
      setEditError(getErrorMessage(error))
    }
  }
  const modified = async (uid: string) => {
    await openDetail(uid)
    snapshot.reload()
    setLogVersion((value) => value + 1)
  }
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="签到活动"
        actions={
          <Button
            variant="outline"
            disabled={busy}
            onClick={refresh}
            leftIcon={<RefreshCw className="size-4" />}
          >
            刷新
          </Button>
        }
      />
      <div className="space-y-2 text-sm text-ink-muted">
        <p>
          {data?.event.archived
            ? '已归档：10月7日至11月6日，每日北京时间05:00更新。'
            : '11月22日至12月22日，个人确认的分钟刷新，共30个签到日。签满全部30天的用户均有机会获得奖励，排名靠前的用户可能另外获得奖励，具体细则以清浅安排为准。'}
        </p>
        {data?.event.debug && (
          <p className="text-danger">本地调试活动：以下数据与正式活动隔离，不参与正式排名。</p>
        )}
        {data && (
          <>
            <p>活动阶段：{PHASE_LABEL[data.phase]}</p>
            <p>
              数据截至：
              <time dateTime={data.snapshotAt}>{formatCheckInDateTime(data.snapshotAt)}</time>
              （北京时间）
            </p>
          </>
        )}
        <p>本页仅在进入、翻页、提交搜索、切换筛选或手动刷新时加载，不自动刷新。</p>
        {busy && <p role="status">正在加载{data ? '，当前仍展示上次快照' : '活动快照'}…</p>}
      </div>

      {snapshot.error && data && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-danger">
          <p>刷新失败，当前仍为旧数据：{getErrorMessage(snapshot.error)}</p>
          <Button size="sm" variant="outline" onClick={refresh} disabled={busy}>
            重试
          </Button>
        </div>
      )}

      {!data ? (
        snapshot.error ? (
          <ErrorState
            message={getErrorMessage(snapshot.error, '签到活动加载失败')}
            onRetry={refresh}
          />
        ) : (
          <Skeleton className="h-40" />
        )
      ) : (
        <>
          <Panel>
            <h2 className="mb-4 font-serif text-lg text-ink">活动汇总</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3">
              {[
                ['参与人数', data.summary.participants],
                ['累计签到', data.summary.totalCheckIns],
                ['当前日签到', data.summary.todayCheckIns ?? '不适用'],
                ['签满30天人数', data.summary.completedParticipants],
                ['已漏签人数', data.summary.missedParticipants],
                ['仍在进行人数', data.summary.inProgressParticipants],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-ink-muted">{label}</dt>
                  <dd className="mt-1 text-xl text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-ink-muted">
              汇总与每日人数始终统计全活动，不随搜索或状态筛选变化。
            </p>
          </Panel>

          <Panel className="p-0" padded={false}>
            <h2 className="p-5 font-serif text-lg text-ink">每日签到人数</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>签到日</TableHead>
                  <TableHead>日期（北京时间）</TableHead>
                  <TableHead>签到人数</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.daily.map((day) => (
                  <TableRow key={day.dayIndex}>
                    <TableCell>第{day.dayIndex + 1}天</TableCell>
                    <TableCell>{getCheckInDateLabel(day.dayIndex, data.event.startsOn)}</TableCell>
                    <TableCell>{day.checkIns}</TableCell>
                    <TableCell>{PHASE_LABEL[day.phase]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}

      <Panel className="flex flex-wrap items-end gap-3 p-4">
        <form
          className="flex flex-1 flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setDetail(null)
            const nextQuery = keyword.trim()
            if (nextQuery === query && pagination.page === 1) {
              refresh()
            } else {
              setRefreshRequested(true)
              pagination.setPage(1)
              setQuery(nextQuery)
            }
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-xs text-ink-muted">搜索昵称或完整UID</span>
            <Input
              value={keyword}
              maxLength={50}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            variant="outline"
            disabled={busy}
            leftIcon={<Search className="size-4" />}
          >
            搜索
          </Button>
        </form>
        <label className="flex w-36 flex-col gap-1.5">
          <span className="text-xs text-ink-muted">参与状态</span>
          <Select
            value={state}
            onChange={(event) => {
              if (event.target.value === state) return
              setDetail(null)
              setRefreshRequested(true)
              pagination.setPage(1)
              setState(event.target.value as typeof state)
            }}
          >
            <option value="">全部</option>
            <option value="in_progress">进行中</option>
            <option value="missed">已漏签</option>
            <option value="completed">已签满</option>
          </Select>
        </label>
      </Panel>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void openDetail(directUid.trim())
        }}
      >
        <Input
          aria-label="完整UID直达"
          value={directUid}
          onChange={(event) => setDirectUid(event.target.value)}
          placeholder="完整UID（含零签到用户）"
          required
        />
        <Button type="submit" variant="outline">
          打开用户明细
        </Button>
      </form>
      {editError && (
        <p role="alert" className="text-danger">
          {editError}
        </p>
      )}

      {data && (
        <Panel className="p-0" padded={false}>
          <div className="flex flex-wrap items-end justify-between gap-2 p-5">
            <h2 className="font-serif text-lg text-ink">参与者</h2>
            <p className="text-xs text-ink-muted">共{data.total}位符合当前筛选的参与者</p>
          </div>
          {data.items.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="没有匹配的参与者"
              description="本活动有签到记录或已设定个人刷新时间的用户出现在列表中；其他真实用户可通过完整UID直达。"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>昵称 / UID</TableHead>
                  <TableHead>微信号</TableHead>
                  <TableHead>账号状态</TableHead>
                  <TableHead>签到天数</TableHead>
                  <TableHead>
                    {data.event.scoreMode === 'elapsed' ? '平均签到耗时' : '平均签到时间'}
                  </TableHead>
                  <TableHead>漏签天数</TableHead>
                  <TableHead>参与状态</TableHead>
                  <TableHead>名次</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>明细</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.userUid}>
                    <TableCell>
                      <span className="block font-medium">{item.displayName}</span>
                      <span className="text-xs text-ink-muted">{item.userUid}</span>
                    </TableCell>
                    <TableCell>
                      {item.wechat ? (
                        <span className="font-mono text-sm font-medium text-ink">
                          {item.wechat}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-muted">未填写</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge tone={item.userStatus === 'banned' ? 'danger' : 'muted'}>
                        {item.userStatus === 'banned' ? '已封禁' : '正常'}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.completedDays}/30</TableCell>
                    <TableCell className="font-mono">
                      {item.averageTimeSeconds === null
                        ? '—'
                        : formatCheckInScore(item.averageTimeSeconds)}
                    </TableCell>
                    <TableCell>{item.missedDayIndexes.length}</TableCell>
                    <TableCell>{STATE_LABEL[item.state]}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {data.phase === 'ended' ? (item.rank ?? '未签满') : '活动结束后确定'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.winner === null
                        ? item.eligible
                          ? '具备获奖机会'
                          : '未签满'
                        : data.phase !== 'ended'
                          ? '活动结束后确定'
                          : item.winner
                            ? '获奖'
                            : item.rank === null
                              ? '不参与获奖排名'
                              : '未获奖'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          setEditError(null)
                          setDetail(item)
                        }}
                        aria-label={`查看 ${item.displayName} 的明细`}
                      >
                        查看明细
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={(page) => {
          if (page === pagination.page) return
          setDetail(null)
          setRefreshRequested(true)
          pagination.setPage(page)
        }}
        pageSize={pagination.pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={(pageSize) => {
          if (pageSize === pagination.pageSize) return
          setDetail(null)
          setRefreshRequested(true)
          pagination.setPageSize(pageSize)
        }}
      />
      <details open={logsOpen} onToggle={(event) => setLogsOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm">操作日志</summary>
        {logsOpen && data && (
          <>
            <label className="my-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!logsUser}
                disabled={!detail && !logsUser}
                onChange={(event) => setLogsUser(event.target.checked ? detail!.userUid : '')}
              />
              仅查看用户：{logsUser || detail?.userUid || '请从明细选择'}
            </label>
            <CheckInLogs
              key={`${data.event.id}:${logsUser}`}
              eventId={data.event.id}
              userUid={logsUser || undefined}
              version={logVersion}
            />
          </>
        )}
      </details>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null)
        }}
      >
        {detail && data && (
          <DialogContent
            title={`${detail.displayName} · 30日签到明细`}
            description={`UID：${detail.userUid}。数据截至北京时间${formatCheckInDateTime(data.snapshotAt)}，所有实际时间均为北京时间。`}
            className="sm:w-[min(56rem,calc(100vw-2rem))]"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLogsUser(detail.userUid)
                setLogsOpen(true)
                setDetail(null)
              }}
            >
              查看此用户操作日志
            </Button>
            <CheckInDetail
              key={detail.userUid}
              detail={detail}
              event={data.event}
              snapshotAt={data.snapshotAt}
              onModified={() => modified(detail.userUid)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}

function CheckInLogs({
  eventId,
  userUid,
  version,
}: {
  eventId: string
  userUid?: string
  version: number
}) {
  const [total, setTotal] = useState(0)
  const pagination = usePagination({
    total,
    defaultPageSize: 24,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    paramPrefix: 'logs_',
  })
  const logs = useAsyncData<Paginated<CheckInAuditLogItem>>(
    (signal) =>
      apiGet(
        '/api/admin/check-in/logs',
        { eventId, userUid, page: pagination.page, pageSize: pagination.pageSize },
        signal
      ),
    [eventId, userUid, version, pagination.page, pagination.pageSize]
  )
  useEffect(() => {
    if (logs.data) setTotal(logs.data.total)
  }, [logs.data])
  return (
    <div className="space-y-3 py-3">
      {logs.loading ? (
        <Skeleton className="h-24" />
      ) : logs.error ? (
        <ErrorState message={getErrorMessage(logs.error)} onRetry={logs.reload} />
      ) : logs.data?.items.length ? (
        logs.data.items.map((log) => (
          <Panel key={log.id} className="space-y-2 text-sm">
            <p>
              {formatCheckInDateTime(log.createdAt)}（北京时间） · {log.actorName}（{log.actorUid}）
              → {log.targetName}（{log.targetUid}）
            </p>
            <p>
              {
                {
                  record_set: '补录/修改签到',
                  record_delete: '撤销签到',
                  profile_update: '修改活动资料',
                }[log.action]
              }{' '}
              · 原因：{log.reason || '未填写'}
            </p>
            <details>
              <summary className="cursor-pointer">展开前后值</summary>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">
                {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
              </pre>
            </details>
          </Panel>
        ))
      ) : (
        <p className="text-sm text-ink-muted">暂无操作日志</p>
      )}
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={pagination.setPage}
        pageSize={pagination.pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={pagination.setPageSize}
      />
    </div>
  )
}

function CheckInDetail({
  detail,
  event,
  snapshotAt,
  onModified,
}: {
  detail: AdminCheckInParticipant
  event: CheckInEvent
  snapshotAt: string
  onModified: () => Promise<void>
}) {
  const [wechat, setWechat] = useState(detail.wechat ?? '')
  const [refresh, setRefresh] = useState('')
  const [reason, setReason] = useState('')
  const [editDay, setEditDay] = useState<number | null>(null)
  const [revoke, setRevoke] = useState(false)
  const [time, setTime] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setWechat(detail.wechat ?? '')
    setRefresh('')
  }, [detail])
  const minute = /^\d{2}:\d{2}$/.test(refresh)
    ? Number(refresh.slice(0, 2)) * 60 + Number(refresh.slice(3))
    : null
  const next =
    minute !== null && detail.initialRefreshMinute !== null
      ? getNextCheckInRefreshChange(
          event,
          detail.initialRefreshMinute,
          detail.refreshChanges,
          new Date(snapshotAt),
          minute
        )
      : null
  const canChangeRefresh =
    !event.archived &&
    (detail.initialRefreshMinute === null
      ? Date.parse(snapshotAt) < Date.parse(event.endsAt)
      : getNextCheckInRefreshChange(
          event,
          detail.initialRefreshMinute,
          detail.refreshChanges,
          new Date(snapshotAt),
          detail.refreshMinute ?? detail.initialRefreshMinute
        ) !== null)
  const preview =
    minute === null
      ? []
      : getCheckInDayWindows(
          event,
          detail.initialRefreshMinute ?? minute,
          next
            ? [
                ...detail.refreshChanges,
                {
                  id: Math.max(0, ...detail.refreshChanges.map((item) => item.id)) + 1,
                  fromDayIndex: next.fromDayIndex,
                  refreshMinute: minute,
                  createdAt: snapshotAt,
                },
              ]
            : detail.refreshChanges
        )
  const write = async (path: string, method: 'PUT' | 'PATCH' | 'DELETE', body: object) => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      await apiRequest<AdminCheckInParticipant>(
        `/api/admin/check-in/participants/${encodeURIComponent(detail.userUid)}/${path}?eventId=${encodeURIComponent(event.id)}`,
        { method, body: { ...body, reason: reason.trim() || undefined } }
      )
      await onModified()
      setEditDay(null)
      setRevoke(false)
      setReason('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="space-y-5">
      <div className="space-y-1 text-sm text-ink-muted">
        <p>
          微信号：<span className="font-mono text-ink">{detail.wechat || '未填写'}</span>
        </p>
        <p>
          已签{detail.completedDays}/30，
          {event.scoreMode === 'elapsed' ? '平均签到耗时' : '平均延长时钟时间'}：
          {detail.averageTimeSeconds === null
            ? '暂无'
            : formatCheckInScore(detail.averageTimeSeconds)}
          。今日待签和未来日期不计入漏签。
        </p>
        <p>
          {detail.refreshMinute === null
            ? '未设定刷新时间'
            : `当前刷新时间：${formatCheckInScore(detail.refreshMinute * 60).slice(0, 5)}（北京时间）`}
        </p>
        {detail.dayWindows.length > 0 && (
          <p>
            个人首尾：{formatCheckInDateTime(detail.dayWindows[0].startsAt)} 至{' '}
            {formatCheckInDateTime(detail.dayWindows[29].endsAt)}
          </p>
        )}
        {detail.refreshChanges.map((change) => (
          <p key={change.id}>
            变更#{change.id}：边界{change.fromDayIndex}起，刷新分钟{change.refreshMinute}；安排于
            {formatCheckInDateTime(change.createdAt)}，生效于
            {formatCheckInDateTime(
              new Date(
                Date.parse(`${event.startsOn}T00:00:00+08:00`) +
                  change.fromDayIndex * 86400000 +
                  change.refreshMinute * 60000
              ).toISOString()
            )}
          </p>
        ))}
      </div>
      <label className="block space-y-1 text-sm">
        修改原因（选填，最多500字）
        <Input
          aria-label="修改原因"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={saving}
        />
      </label>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void write('profile', 'PATCH', {
            wechat: wechat.trim() || null,
            ...(minute !== null && canChangeRefresh ? { refreshMinute: minute } : {}),
          })
        }}
      >
        <h3 className="font-serif text-lg">活动资料</h3>
        <label className="block text-sm">
          微信号
          <Input
            aria-label="编辑微信号"
            value={wechat}
            maxLength={30}
            onChange={(e) => setWechat(e.target.value)}
            disabled={saving}
          />
        </label>
        {!event.archived && (
          <label className="block text-sm">
            初始/未来刷新时间（北京时间）
            <Input
              aria-label="管理刷新时间"
              type="time"
              step={60}
              value={refresh}
              onChange={(e) => setRefresh(e.target.value)}
              disabled={saving || !canChangeRefresh}
            />
          </label>
        )}
        {!canChangeRefresh && (
          <p className="text-sm text-ink-muted">没有可修改的未来边界；仍可更正过去签到与微信。</p>
        )}
        {minute !== null && canChangeRefresh && (
          <div className="space-y-1 text-sm text-ink-muted">
            {detail.initialRefreshMinute === null ? (
              <p>
                首次设点：{formatCheckInDateTime(preview[0].startsAt)} 至{' '}
                {formatCheckInDateTime(preview[29].endsAt)}，不会补建过去记录。
              </p>
            ) : next ? (
              <>
                <p>
                  边界{next.fromDayIndex}（
                  {next.fromDayIndex === 30 ? '最后截止' : `第${next.fromDayIndex + 1}天起`}
                  ），北京时间{formatCheckInDateTime(next.effectiveAt)}生效。
                </p>
                {next.fromDayIndex > 0 && (
                  <p>
                    交接日窗口：{formatCheckInDateTime(preview[next.fromDayIndex - 1].startsAt)} 至{' '}
                    {formatCheckInDateTime(preview[next.fromDayIndex - 1].endsAt)}
                    。此前记录和分数不变。
                  </p>
                )}
              </>
            ) : (
              <p>所选刷新时间没有未来可生效边界。</p>
            )}
          </div>
        )}
        <Button
          type="submit"
          disabled={saving || (minute !== null && detail.initialRefreshMinute !== null && !next)}
          loading={saving}
        >
          保存活动资料
        </Button>
      </form>
      {editDay !== null && (
        <form
          className="space-y-3 border-y border-border py-3"
          onSubmit={(e) => {
            e.preventDefault()
            void write(
              `records/${editDay}`,
              revoke ? 'DELETE' : 'PUT',
              revoke ? {} : { checkedInAt: new Date(`${time}+08:00`).toISOString() }
            )
          }}
        >
          <h3 className="font-serif">
            第{editDay + 1}天：{revoke ? '确认撤销签到？' : '补录/修改时间'}
          </h3>
          {detail.dayWindows[editDay] && (
            <p className="text-sm">
              目标窗口：{formatCheckInDateTime(detail.dayWindows[editDay].startsAt)} 至{' '}
              {formatCheckInDateTime(detail.dayWindows[editDay].endsAt)}（不含截止）
            </p>
          )}
          {!revoke && (
            <label className="block text-sm">
              实际签到北京时间
              <Input
                aria-label="实际签到北京时间"
                type="datetime-local"
                step={1}
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                disabled={saving}
              />
            </label>
          )}
          <Button type="submit" disabled={saving} loading={saving}>
            {revoke ? '确认撤销' : '保存签到时间'}
          </Button>
          <Button variant="ghost" disabled={saving} onClick={() => setEditDay(null)}>
            取消
          </Button>
        </form>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>签到日 / 日期</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>窗口 / 实际北京时间</TableHead>
            <TableHead>{event.scoreMode === 'elapsed' ? '签到耗时' : '延长时钟计分'}</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 30 }, (_, dayIndex) => {
            const record = detail.records.find((item) => item.dayIndex === dayIndex)
            const window = detail.dayWindows[dayIndex]
            return (
              <TableRow key={dayIndex}>
                <TableCell>
                  第{dayIndex + 1}天 · {getCheckInDateLabel(dayIndex, event.startsOn)}
                </TableCell>
                <TableCell>
                  {window
                    ? getCheckInDayStatus(dayIndex, detail.phase, detail.dayIndex, !!record)
                    : '未设定'}
                </TableCell>
                <TableCell>
                  {window ? (
                    <p className="text-xs text-ink-muted">
                      {formatCheckInDateTime(window.startsAt)} —{' '}
                      {formatCheckInDateTime(window.endsAt)}
                    </p>
                  ) : (
                    <p>未设定刷新时间</p>
                  )}
                  {record && (
                    <time dateTime={record.checkedInAt}>
                      {formatCheckInDateTime(record.checkedInAt)}
                    </time>
                  )}
                </TableCell>
                <TableCell>{record ? formatCheckInScore(record.scoreSeconds) : '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saving || !window}
                      onClick={() => {
                        setEditDay(dayIndex)
                        setRevoke(false)
                        setError(null)
                        setTime(
                          formatCheckInDateTime(record?.checkedInAt ?? window.startsAt).replace(
                            ' ',
                            'T'
                          )
                        )
                      }}
                    >
                      {record ? '修改时间' : '补录'}
                    </Button>
                    {record && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => {
                          setEditDay(dayIndex)
                          setRevoke(true)
                          setError(null)
                        }}
                      >
                        撤销签到
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export default function AdminCheckIn() {
  const { user } = useAuth()
  const [eventId, setEventId] = useState<string | undefined>()
  const [, setParams] = useSearchParams()
  const events = useAsyncData<CheckInStatusResponse>(
    (signal) => apiGet('/api/check-in', undefined, signal),
    [user?.uid]
  )
  return (
    <div className="space-y-5">
      <label className="block text-sm">
        选择签到活动
        <Select
          aria-label="选择签到活动"
          value={eventId ?? events.data?.event.id ?? ''}
          onChange={(e) => {
            setParams(
              (previous) => {
                const next = new URLSearchParams(previous)
                for (const key of ['page', 'pageSize', 'logs_page', 'logs_pageSize'])
                  next.delete(key)
                return next
              },
              { replace: true }
            )
            setEventId(e.target.value)
          }}
        >
          {!events.data && <option value="">本期活动</option>}
          {events.data?.events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.startsOn}
              {event.archived ? '（已归档）' : '（本期）'}
            </option>
          ))}
        </Select>
      </label>
      {events.error && (
        <ErrorState message={getErrorMessage(events.error)} onRetry={events.reload} />
      )}
      <AdminCheckInActivity key={`${user?.uid}:${eventId ?? 'current'}`} eventId={eventId} />
    </div>
  )
}
