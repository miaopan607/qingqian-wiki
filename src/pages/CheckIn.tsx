import { CalendarCheck, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { Pagination } from '../components/Pagination'
import { TurnstileChallenge } from '../components/TurnstileChallenge'
import {
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Panel,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { usePagination } from '../hooks/usePagination'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { apiGet, apiPost, apiRequest } from '../lib/apiClient'
import {
  formatCheckInDateTime,
  formatCheckInScore,
  getCheckInDateLabel,
  getCheckInDayStatus,
} from '../lib/checkIn'
import { AppError, getErrorMessage } from '../lib/errorHandler'
import type {
  CheckInRankingResponse,
  CheckInStatusResponse,
  SubmitCheckInInput,
  SubmitCheckInResponse,
  UpdateCheckInProfileInput,
  UpdateCheckInProfileResponse,
} from '../types/api'
import type { CheckInEvent as CheckInEventType, CheckInRecord } from '../types/entities'
import { getCheckInDayWindows } from '../lib/checkInSchedule'

const PAGE_SIZE_OPTIONS = [24, 48, 96]
const REWARD_RULE =
  '签满全部30天的用户均有机会获得奖励，排名靠前的用户可能另外获得奖励，具体细则以清浅安排为准。'

function CheckInRankings({ event }: { event: CheckInEventType }) {
  const [total, setTotal] = useState(0)
  const pagination = usePagination({
    total,
    defaultPageSize: 24,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  })
  const rankings = useAsyncData<CheckInRankingResponse>(
    (signal) =>
      apiGet<CheckInRankingResponse>(
        '/api/check-in/rankings',
        { eventId: event.id, page: pagination.page, pageSize: pagination.pageSize },
        signal
      ),
    [event.id, pagination.page, pagination.pageSize]
  )

  useEffect(() => {
    if (!rankings.data) return
    setTotal(rankings.data.total)
    const lastPage = Math.max(1, Math.ceil(rankings.data.total / pagination.pageSize))
    if (rankings.data.page > lastPage) pagination.setPage(lastPage)
  }, [rankings.data, pagination.pageSize, pagination.setPage])

  return (
    <section className="flex flex-col gap-4" aria-labelledby="check-in-rankings-title">
      <h2 id="check-in-rankings-title" className="font-serif text-xl text-ink">
        最终签到排名
      </h2>
      <p className="text-sm text-ink-muted">
        {event.rewardMode === 'possible'
          ? REWARD_RULE
          : '签满30天者按平均签到时间排名；并列第一共同获奖，由人工发放活动奖励。'}
      </p>
      {rankings.loading ? (
        <Skeleton className="h-48" />
      ) : rankings.error ? (
        <ErrorState
          message={getErrorMessage(rankings.error, '排名加载失败')}
          onRetry={rankings.reload}
        />
      ) : !rankings.data || rankings.data.total === 0 ? (
        <EmptyState icon={CalendarCheck} title="本次活动暂无签到记录" />
      ) : (
        <>
          {event.rewardMode === 'first_place' && rankings.data.qualifiedTotal === 0 && (
            <p className="text-sm text-ink-muted">本次活动无人签满30天，无获奖者。</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名次</TableHead>
                <TableHead>昵称</TableHead>
                <TableHead>签到天数</TableHead>
                <TableHead>
                  {event.scoreMode === 'elapsed' ? '平均签到耗时' : '平均签到时间'}
                </TableHead>
                <TableHead>结果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankings.data.items.map((item) => (
                <TableRow key={item.userUid}>
                  <TableCell>{item.rank ?? '未签满'}</TableCell>
                  <TableCell>{item.displayName}</TableCell>
                  <TableCell>{item.completedDays}/30</TableCell>
                  <TableCell className="font-mono">
                    {item.averageTimeSeconds === null
                      ? '—'
                      : formatCheckInScore(item.averageTimeSeconds)}
                  </TableCell>
                  <TableCell>
                    {item.winner === null
                      ? item.rank === null
                        ? '未签满'
                        : '具备获奖机会'
                      : item.winner
                        ? '获奖'
                        : item.rank === null
                          ? '未签满，不参与获奖排名'
                          : '未获奖'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        onPageChange={pagination.setPage}
        pageSize={pagination.pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={pagination.setPageSize}
      />
    </section>
  )
}

function CheckInEvent({ eventId }: { eventId?: string }) {
  const { user } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [challengeError, setChallengeError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedRecord, setSubmittedRecord] = useState<CheckInRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refreshRequested, setRefreshRequested] = useState(true)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const toast = useToast()
  const [wechatInput, setWechatInput] = useState('')
  const [wechatSaving, setWechatSaving] = useState(false)
  const [wechatError, setWechatError] = useState<string | null>(null)
  const [refreshTime, setRefreshTime] = useState('')
  const [refreshConfirm, setRefreshConfirm] = useState(false)
  const [refreshSaving, setRefreshSaving] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const refreshSavingRef = useRef(false)
  const [wechatEditing, setWechatEditing] = useState(false)
  const submittingRef = useRef(false)
  const mountedRef = useRef(true)
  const clockRef = useRef<{ response: CheckInStatusResponse; deadline: number | null } | null>(null)

  const status = useAsyncData<CheckInStatusResponse>(
    async (signal) => {
      const response = await apiGet<CheckInStatusResponse>('/api/check-in', { eventId }, signal)
      if (!signal.aborted) {
        // 以响应到达时的单调时钟为基准，设备墙上时钟不参与活动判定。
        clockRef.current = {
          response,
          deadline:
            response.nextTransitionAt === null
              ? null
              : performance.now() +
                new Date(response.nextTransitionAt).getTime() -
                new Date(response.serverNow).getTime(),
        }
      }
      return response
    },
    [user?.uid, eventId]
  )

  const refreshStatus = useCallback(() => {
    setToken(null)
    setChallengeError(null)
    setRefreshRequested(true)
    status.reload()
  }, [status.reload])
  useEffect(() => {
    if (status.data?.me) {
      setWechatInput(status.data.me.wechat ?? '')
    }
  }, [status.data?.me?.wechat])

  const handleWechatSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (wechatSaving) return
    setWechatSaving(true)
    setWechatError(null)
    try {
      const trimmed = wechatInput.trim()
      const payload: UpdateCheckInProfileInput = { wechat: trimmed || null }
      const result = await apiRequest<UpdateCheckInProfileResponse>(
        `/api/check-in/wechat?eventId=${encodeURIComponent(status.data!.event.id)}`,
        {
          method: 'PUT',
          body: payload,
        }
      )
      setWechatInput(result.wechat ?? '')
      setWechatEditing(false)
      toast.show({ title: result.wechat ? '微信号已保存' : '微信号已清除', tone: 'success' })
      refreshStatus()
    } catch (err) {
      setWechatError(getErrorMessage(err, '保存微信号失败，请重试'))
    } finally {
      setWechatSaving(false)
    }
  }

  const handleTokenChange = useCallback((nextToken: string | null) => {
    if (!submittingRef.current || nextToken === null) setToken(nextToken)
    if (nextToken) setChallengeError(null)
  }, [])

  const handleChallengeError = useCallback((message: string) => {
    setToken(null)
    setChallengeError(message)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!status.loading) setRefreshRequested(false)
  }, [status.loading, status.data, status.error])

  useEffect(() => {
    const clock = clockRef.current
    if (!status.data || clock?.response !== status.data) return
    const deadline = clock.deadline
    if (deadline === null) {
      setRemainingSeconds(null)
      return
    }
    let transitionTimer: number
    let crossed = false
    const updateCountdown = () => {
      setRemainingSeconds(Math.max(0, Math.ceil((deadline - performance.now()) / 1000)))
    }
    const scheduleTransition = () => {
      const remaining = deadline - performance.now()
      if (remaining <= 0) {
        if (!crossed) {
          crossed = true
          refreshStatus()
        }
        return
      }
      transitionTimer = window.setTimeout(scheduleTransition, Math.min(remaining, 2_147_483_647))
    }
    updateCountdown()
    scheduleTransition()
    const countdownTimer = window.setInterval(updateCountdown, 1000)
    return () => {
      window.clearTimeout(transitionTimer)
      window.clearInterval(countdownTimer)
    }
  }, [status.data, refreshStatus])

  useEffect(() => {
    const response = status.data
    if (!response || response.phase !== 'ended') return
    const remaining =
      Date.parse(response.event.rankingsAvailableAt) - Date.parse(response.serverNow)
    if (remaining <= 0) return
    const timer = window.setTimeout(refreshStatus, Math.min(remaining, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [status.data, refreshStatus])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshStatus()
    }
    window.addEventListener('focus', refreshStatus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', refreshStatus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshStatus])

  const data = status.data
  const records = data?.me?.records ?? []
  const todayRecord = records.find((record) => record.dayIndex === data?.dayIndex)
  const refreshing = status.loading || refreshRequested
  const canSign =
    !data?.event.archived &&
    data?.phase === 'active' &&
    user?.status === 'active' &&
    data.dayIndex !== null &&
    !!data.turnstileSiteKey &&
    !todayRecord &&
    !refreshing &&
    !status.error
  const hasMissedDay = !!data?.me?.missedDayIndexes.length
  const previewMinute = /^\d{2}:\d{2}$/.test(refreshTime)
    ? Number(refreshTime.slice(0, 2)) * 60 + Number(refreshTime.slice(3))
    : null
  const previewWindows =
    data && previewMinute !== null ? getCheckInDayWindows(data.event, previewMinute, []) : []
  const saveRefresh = async () => {
    if (!data || previewMinute === null || refreshSavingRef.current) return
    refreshSavingRef.current = true
    setRefreshSaving(true)
    setRefreshError(null)
    try {
      await apiRequest<CheckInStatusResponse>(
        `/api/check-in/refresh-time?eventId=${encodeURIComponent(data.event.id)}`,
        { method: 'PUT', body: { refreshMinute: previewMinute } }
      )
      setRefreshConfirm(false)
      refreshStatus()
    } catch (error) {
      setRefreshError(getErrorMessage(error))
    } finally {
      refreshSavingRef.current = false
      setRefreshSaving(false)
    }
  }

  const submit = async () => {
    if (!canSign || !token || submittingRef.current || !data) return
    const deadline = clockRef.current?.deadline
    if (deadline !== null && deadline !== undefined && performance.now() >= deadline) {
      refreshStatus()
      return
    }
    const input: SubmitCheckInInput = { turnstileToken: token, dayIndex: data.dayIndex! }
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const response = await apiPost<SubmitCheckInResponse>(
        `/api/check-in?eventId=${encodeURIComponent(data.event.id)}`,
        input
      )
      if (!mountedRef.current) return
      setSubmittedRecord(response.record)
      refreshStatus()
    } catch (error) {
      if (!mountedRef.current) return
      setSubmitError(getErrorMessage(error))
      if (error instanceof AppError && error.statusCode === 409) refreshStatus()
    } finally {
      submittingRef.current = false
      if (mountedRef.current) {
        setSubmitting(false)
        setToken(null)
        setResetKey((key) => key + 1)
      }
    }
  }

  return (
    <div className="flex flex-col gap-10 pb-12">
      {!user && (
        <p className="text-sm text-ink-muted">
          登录后可参与签到、查看个人进度。{' '}
          <Link className="text-accent hover:underline" to="/login?redirect=%2Fcheck-in">
            登录后签到
          </Link>
        </p>
      )}

      {data && !data.event.archived && user?.status === 'active' && (
        <Panel className="space-y-3">
          <h2 className="font-serif text-xl">个人刷新时间（北京时间）</h2>
          {data.me?.initialRefreshMinute === null ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                setRefreshError(null)
                setRefreshConfirm(true)
              }}
              className="space-y-3"
            >
              <Field label="每日刷新时间" htmlFor="refresh-time">
                <Input
                  id="refresh-time"
                  type="time"
                  step={60}
                  required
                  value={refreshTime}
                  disabled={refreshSaving}
                  onChange={(event) => setRefreshTime(event.target.value)}
                />
              </Field>
              <Button type="submit" disabled={refreshSaving || previewMinute === null}>
                设定刷新时间
              </Button>
            </form>
          ) : data.me?.refreshMinute !== null && data.me?.refreshMinute !== undefined ? (
            <>
              <p>
                当前每日刷新：{formatCheckInScore(data.me.refreshMinute * 60).slice(0, 5)}
                （已锁定，不能自行修改）
              </p>
              <p>
                个人开始：
                {data.me.dayWindows[0] && formatCheckInDateTime(data.me.dayWindows[0].startsAt)}
                ；个人截止：
                {data.me.dayWindows.at(-1) &&
                  formatCheckInDateTime(data.me.dayWindows.at(-1)!.endsAt)}
              </p>
              {data.me.refreshChanges.map((change) => (
                <p key={change.id}>
                  管理变更：边界{change.fromDayIndex}起{' '}
                  {formatCheckInScore(change.refreshMinute * 60).slice(0, 5)}，安排于
                  {formatCheckInDateTime(change.createdAt)}，生效于
                  {formatCheckInDateTime(
                    new Date(
                      Date.parse(`${data.event.startsOn}T00:00:00+08:00`) +
                        change.fromDayIndex * 86400000 +
                        change.refreshMinute * 60000
                    ).toISOString()
                  )}
                </p>
              ))}
            </>
          ) : null}
          <Dialog
            open={refreshConfirm}
            onOpenChange={(open) => {
              if (!refreshSaving) setRefreshConfirm(open)
            }}
          >
            <DialogContent
              title="确认个人刷新时间"
              description="确认后，本次活动期间你将无法自行修改刷新时间，请谨慎选择。"
            >
              <p>每日北京时间{refreshTime}</p>
              <p>
                个人开始：{previewWindows[0] && formatCheckInDateTime(previewWindows[0].startsAt)}
              </p>
              <p>
                个人截止：
                {previewWindows.at(-1) && formatCheckInDateTime(previewWindows.at(-1)!.endsAt)}
              </p>
              {refreshError && (
                <p role="alert" className="text-danger">
                  {refreshError}
                </p>
              )}
              <Button
                onClick={() => void saveRefresh()}
                loading={refreshSaving}
                disabled={refreshSaving}
              >
                确认并锁定
              </Button>
            </DialogContent>
          </Dialog>
        </Panel>
      )}

      {!data?.event.archived && (
        <Panel className="flex flex-col items-start gap-4">
          <PageHeader
            title="今日签到"
            className="w-full"
            actions={
              <Button
                variant="ghost"
                size="sm"
                disabled={refreshing || submitting}
                onClick={refreshStatus}
                leftIcon={<RefreshCw className="size-4" />}
              >
                刷新
              </Button>
            }
          />
          {remainingSeconds !== null && data && (
            <p className="text-sm text-ink-muted">
              {data.phase === 'upcoming' ? '距离活动开始' : '距离签到日更新'}：
              <span className="font-mono">{formatCheckInScore(remainingSeconds)}</span>
            </p>
          )}
          {submittedRecord && (
            <p role="status" className="text-sm text-accent">
              签到成功：北京时间{formatCheckInDateTime(submittedRecord.checkedInAt)}，计分
              {formatCheckInScore(submittedRecord.scoreSeconds)}。
            </p>
          )}
          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}
          {status.error ? (
            <ErrorState
              message={getErrorMessage(status.error, '签到状态加载失败')}
              onRetry={refreshStatus}
              className="w-full py-6"
            />
          ) : refreshing ? (
            <div role="status" className="w-full">
              <p className="mb-3 text-sm text-ink-muted">正在刷新签到状态…</p>
              <Skeleton className="h-20" />
            </div>
          ) : data?.phase === 'upcoming' ? (
            <p className="text-sm text-ink-muted">签到活动尚未开始，请于个人首个刷新时刻后再来。</p>
          ) : data?.phase === 'ended' ? (
            <p className="text-sm text-ink-muted">个人签到活动已结束，榜单须等待全活动公示。</p>
          ) : !user ? null : user.status === 'banned' ? (
            <p className="text-sm text-danger">账号已被封禁，无法参与签到。</p>
          ) : data?.me?.initialRefreshMinute === null ? (
            <p className="text-sm text-ink-muted">请先设定并确认个人刷新时间。</p>
          ) : todayRecord ? (
            <p className="text-sm text-accent">
              今日已签到：北京时间{formatCheckInDateTime(todayRecord.checkedInAt)}，计分
              {formatCheckInScore(todayRecord.scoreSeconds)}。
            </p>
          ) : !data?.turnstileSiteKey ? (
            <p className="text-sm text-ink-muted">签到人机验证尚未配置，暂时无法签到。</p>
          ) : canSign ? (
            <>
              <p className="text-sm text-ink-muted">
                今日签到日：{getCheckInDateLabel(data.dayIndex!, data.event.startsOn)}
                。完成人机验证后提交，以服务端验证完成时间计分。
              </p>
              <TurnstileChallenge
                key={`${user.uid}:${data.event.id}:${data.dayIndex}`}
                siteKey={data.turnstileSiteKey}
                resetKey={resetKey}
                onTokenChange={handleTokenChange}
                onError={handleChallengeError}
                className="w-full max-w-sm"
              />
              {challengeError && (
                <>
                  <p role="alert" className="text-sm text-danger">
                    {challengeError}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={submitting}
                    onClick={() => {
                      setToken(null)
                      setChallengeError(null)
                      setResetKey((key) => key + 1)
                    }}
                  >
                    重新验证
                  </Button>
                </>
              )}
              <Button
                onClick={() => void submit()}
                disabled={!token || submitting}
                loading={submitting}
              >
                {submitting ? '正在签到…' : '签到'}
              </Button>
            </>
          ) : null}
        </Panel>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="check-in-progress-title">
        <h2 id="check-in-progress-title" className="font-serif text-xl text-ink">
          30天进度
        </h2>
        {user && data?.me ? (
          <div className="space-y-2 text-sm text-ink-muted">
            <p>
              已签{data.me.completedDays}/30 · 个人
              {data.event.scoreMode === 'elapsed' ? '平均签到耗时' : '平均签到时间'}：
              <span className="font-mono">
                {data.me.averageTimeSeconds === null
                  ? '暂无'
                  : formatCheckInScore(data.me.averageTimeSeconds)}
              </span>
            </p>
            {data.me.eligible ? (
              <p className="text-accent">
                {data.event.rewardMode === 'possible'
                  ? '已签满30天，具备获奖机会。'
                  : '已签满30天，具备获奖排名资格。'}
              </p>
            ) : hasMissedDay ? (
              <p>已有漏签，尚未签满30天；活动期间仍可继续签到。</p>
            ) : (
              <p>
                {data.event.rewardMode === 'possible' ? REWARD_RULE : '签满30天后参与获奖排名。'}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            {user ? '正在加载个人进度…' : '登录后可查看个人签到进度。'}
          </p>
        )}
        {!data ? (
          <Skeleton className="h-64" />
        ) : (
          <ol className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {Array.from({ length: 30 }, (_, dayIndex) => {
              const record = records.find((item) => item.dayIndex === dayIndex)
              const label =
                !data.event.archived && data.me?.initialRefreshMinute === null
                  ? '未设定'
                  : getCheckInDayStatus(dayIndex, data.phase, data.dayIndex, !!record)
              return (
                <li
                  key={dayIndex}
                  className={`min-w-0 rounded-xl border p-2 text-center text-xs ${record ? 'border-accent/40 bg-accent-soft text-accent' : label === '漏签' ? 'border-border text-ink-muted' : 'border-border text-ink'}`}
                >
                  {record ? (
                    <details>
                      <summary className="cursor-pointer list-none space-y-2">
                        <span className="block">
                          {getCheckInDateLabel(dayIndex, data.event.startsOn)}
                        </span>
                        <span className="block font-medium">已签 · 明细</span>
                      </summary>
                      <p className="mt-2 break-words text-[0.6875rem]">
                        北京时间
                        <time dateTime={record.checkedInAt} className="block">
                          {formatCheckInDateTime(record.checkedInAt)}
                        </time>
                      </p>
                      <p className="mt-1 break-all font-mono text-[0.6875rem]">
                        {formatCheckInScore(record.scoreSeconds)}
                      </p>
                    </details>
                  ) : (
                    <>
                      <span className="block">
                        {getCheckInDateLabel(dayIndex, data.event.startsOn)}
                      </span>
                      <span className="mt-2 block font-medium">{label}</span>
                    </>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {user && data && !data.event.archived && (
        <section className="flex flex-col gap-4" aria-labelledby="check-in-wechat-title">
          <h2 id="check-in-wechat-title" className="font-serif text-xl text-ink">
            发奖联系方式
          </h2>
          <Panel className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">
              微信号仅供管理员在活动结束后发奖联系使用，前台榜单不公开，随时可修改。
            </p>
            {!wechatEditing && data.me?.wechat ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-ink-muted">已绑定微信号：</span>
                  <span className="font-mono text-base font-medium text-ink">{data.me.wechat}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setWechatInput(data.me?.wechat ?? '')
                    setWechatEditing(true)
                  }}
                >
                  修改微信号
                </Button>
              </div>
            ) : (
              <form className="flex flex-col gap-3" onSubmit={handleWechatSubmit}>
                <Field
                  label="微信号"
                  htmlFor="check-in-wechat-input"
                  hint="仅支持字母、数字、下划线与连字符，最多 30 个字符；清空提交可解除绑定"
                  error={wechatError}
                >
                  <Input
                    id="check-in-wechat-input"
                    maxLength={30}
                    value={wechatInput}
                    onChange={(event) => setWechatInput(event.target.value)}
                    placeholder="请输入你的微信号"
                  />
                </Field>
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" loading={wechatSaving}>
                    保存微信号
                  </Button>
                  {data.me?.wechat && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={wechatSaving}
                      onClick={() => {
                        setWechatInput(data.me?.wechat ?? '')
                        setWechatEditing(false)
                        setWechatError(null)
                      }}
                    >
                      取消
                    </Button>
                  )}
                </div>
              </form>
            )}
          </Panel>
        </section>
      )}

      {data && Date.parse(data.serverNow) >= Date.parse(data.event.rankingsAvailableAt) ? (
        <CheckInRankings event={data.event} />
      ) : (
        <section className="border-t border-border pt-6">
          <h2 className="font-serif text-xl text-ink">签到排名</h2>
          <p className="mt-3 text-sm text-ink-muted">活动结束后公示排名</p>
        </section>
      )}
      <section
        className="border-t border-border pt-4 text-ink-muted"
        aria-labelledby="check-in-rules-title"
      >
        <h2 id="check-in-rules-title" className="text-sm font-medium">
          活动规则
        </h2>
        <p className="mt-3 text-sm leading-7 text-ink-muted">
          {data?.event.archived
            ? '已归档：北京时间2026年10月7日05:00至11月6日05:00，每日05:00刷新。'
            : '北京时间2026年11月22日至12月22日：按本人确认的北京时间，从11月22日该时刻起至12月22日同一时刻止，共30个签到日。'}
        </p>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-ink-muted">
          <li>仅已登录且未封禁的用户可签到，每日一次，需完成人机验证，不可补签。</li>
          <li>
            {data?.event.rewardMode === 'first_place'
              ? '签满全部30天才参与获奖排名，平均签到时间越早越优；并列第一共同获得活动奖励，由人工发放。'
              : REWARD_RULE}
          </li>
          <li>
            {data?.event.scoreMode === 'extended_clock'
              ? '凌晨按加24小时的延长时钟计分：当日06:00记06:00，次日01:00记25:00。'
              : '按个人每日刷新后耗时计分，平均签到耗时越短排名越靠前。本人确认后不能修改刷新时间；管理员改点只影响未来边界，交接日可能变长或变短，已有记录和分数不变。'}
          </li>
          <li>
            活动期间仅能查看自己的进度与均值；北京时间
            {data?.event.archived ? '11月6日05:00' : '12月22日23:59'}
            所有人结束后公示榜单，个人提前结束仍需等待。
          </li>
        </ul>
        {data?.event.debug && (
          <p role="status" className="mt-3 text-sm text-danger">
            本地调试活动：使用模拟活动时间，仍需真实人机验证；记录与正式活动隔离，不参与正式奖励。
          </p>
        )}
      </section>
      {data?.events
        .filter((event) => event.id !== data.event.id)
        .map((event) => (
          <Link
            key={event.id}
            className="text-xs text-ink-muted"
            to={`/check-in?eventId=${encodeURIComponent(event.id)}`}
          >
            {event.archived ? '历史活动：2026年10月签到' : '返回本期活动'}
          </Link>
        ))}
    </div>
  )
}

export default function CheckIn() {
  const { user } = useAuth()
  const { config } = useSiteConfig()
  const [params, setParams] = useSearchParams()
  const previousUserUid = useRef(user?.uid)
  useEffect(() => {
    if (previousUserUid.current === user?.uid) return
    previousUserUid.current = user?.uid
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('page')
        next.delete('pageSize')
        return next
      },
      { replace: true }
    )
  }, [user?.uid, setParams])
  const eventId = params.get('eventId') ?? undefined
  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <header className="flex flex-col items-center gap-4 py-12 text-center md:py-16">
        <p className="font-serif text-4xl tracking-[0.2em] text-ink md:text-5xl">{config.name}</p>
        <PageHeader title="30天签到" className="font-serif" />
      </header>
      {/* 切换账号时销毁个人快照及挑战，不能沿用上一位用户的 token。 */}
      <CheckInEvent key={`${user?.uid ?? 'guest'}:${eventId ?? 'current'}`} eventId={eventId} />
    </div>
  )
}
