import { CalendarCheck, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'

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
import { apiGet } from '../../lib/apiClient'
import {
  formatCheckInDateTime,
  formatCheckInScore,
  getCheckInDateLabel,
  getCheckInDayStatus,
} from '../../lib/checkIn'
import { getErrorMessage } from '../../lib/errorHandler'
import type { AdminCheckInResponse } from '../../types/api'
import type { AdminCheckInParticipant } from '../../types/entities'

const PAGE_SIZE_OPTIONS = [24, 48, 96]
const PHASE_LABEL = { upcoming: '未开始', active: '进行中', ended: '已结束' }
const STATE_LABEL = { in_progress: '进行中', missed: '已漏签', completed: '已签满' }

export default function AdminCheckIn() {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState<'' | AdminCheckInParticipant['state']>('')
  const [total, setTotal] = useState(0)
  const [detail, setDetail] = useState<AdminCheckInParticipant | null>(null)
  const [refreshRequested, setRefreshRequested] = useState(true)
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
          page: pagination.page,
          pageSize: pagination.pageSize,
          q: query || undefined,
          state: state || undefined,
        },
        signal
      ),
    [pagination.page, pagination.pageSize, query, state]
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
        <p>北京时间2026年10月7日05:00至11月6日05:00，每日05:00更新，共30个签到日。</p>
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
                    <TableCell>{getCheckInDateLabel(day.dayIndex)}</TableCell>
                    <TableCell>{day.checkIns}</TableCell>
                    <TableCell>
                      {day.closed
                        ? '已结束'
                        : data.phase === 'active' && day.dayIndex === data.dayIndex
                          ? '进行中'
                          : '未开始'}
                    </TableCell>
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
              description="只有至少签到一次的用户才会出现在参与者列表中。"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>昵称 / UID</TableHead>
                  <TableHead>账号状态</TableHead>
                  <TableHead>签到天数</TableHead>
                  <TableHead>平均签到时间</TableHead>
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
                      <Badge tone={item.userStatus === 'banned' ? 'danger' : 'muted'}>
                        {item.userStatus === 'banned' ? '已封禁' : '正常'}
                      </Badge>
                    </TableCell>
                    <TableCell>{item.completedDays}/30</TableCell>
                    <TableCell className="font-mono">
                      {formatCheckInScore(item.averageTimeSeconds)}
                    </TableCell>
                    <TableCell>{item.missedDayIndexes.length}</TableCell>
                    <TableCell>{STATE_LABEL[item.state]}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {data.phase === 'ended' ? (item.rank ?? '未签满') : '活动结束后确定'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {data.phase !== 'ended'
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
                        onClick={() => setDetail(item)}
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
            <p className="text-sm text-ink-muted">
              已签{detail.completedDays}/30，平均延长时钟时间
              {formatCheckInScore(detail.averageTimeSeconds)}。今日待签和未来日期不计入漏签。
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>签到日 / 日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>实际北京时间</TableHead>
                  <TableHead>延长时钟计分</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: 30 }, (_, dayIndex) => {
                  const record = detail.records.find((item) => item.dayIndex === dayIndex)
                  return (
                    <TableRow key={dayIndex}>
                      <TableCell>
                        第{dayIndex + 1}天 · {getCheckInDateLabel(dayIndex)}
                      </TableCell>
                      <TableCell>
                        {getCheckInDayStatus(dayIndex, data.phase, data.dayIndex, !!record)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {record ? (
                          <time dateTime={record.checkedInAt}>
                            {formatCheckInDateTime(record.checkedInAt)}
                          </time>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="font-mono">
                        {record ? formatCheckInScore(record.scoreSeconds) : '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
