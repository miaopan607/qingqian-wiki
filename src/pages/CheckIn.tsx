import { CalendarCheck, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Pagination } from '../components/Pagination'
import { TurnstileChallenge } from '../components/TurnstileChallenge'
import {
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
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
import { useAuth } from '../context/AuthContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { usePagination } from '../hooks/usePagination'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { apiGet, apiPost } from '../lib/apiClient'
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
} from '../types/api'
import type { CheckInRecord } from '../types/entities'

const PAGE_SIZE_OPTIONS = [24, 48, 96]

function CheckInRankings() {
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
        { page: pagination.page, pageSize: pagination.pageSize },
        signal
      ),
    [pagination.page, pagination.pageSize]
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
        签满30天者按平均签到时间排名；并列第一共同获奖，由人工发放活动奖励。
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
          {rankings.data.qualifiedTotal === 0 && (
            <p className="text-sm text-ink-muted">本次活动无人签满30天，无获奖者。</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名次</TableHead>
                <TableHead>昵称</TableHead>
                <TableHead>签到天数</TableHead>
                <TableHead>平均签到时间</TableHead>
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
                    {item.winner
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

function CheckInEvent() {
  const { user } = useAuth()
  const [token, setToken] = useState<string | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const [challengeError, setChallengeError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedRecord, setSubmittedRecord] = useState<CheckInRecord | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [refreshRequested, setRefreshRequested] = useState(true)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const submittingRef = useRef(false)
  const mountedRef = useRef(true)
  const clockRef = useRef<{ response: CheckInStatusResponse; deadline: number | null } | null>(null)

  const status = useAsyncData<CheckInStatusResponse>(
    async (signal) => {
      const response = await apiGet<CheckInStatusResponse>('/api/check-in', undefined, signal)
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
    [user?.uid]
  )

  const refreshStatus = useCallback(() => {
    setToken(null)
    setChallengeError(null)
    setRefreshRequested(true)
    status.reload()
  }, [status.reload])

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
    data?.phase === 'active' &&
    user?.status === 'active' &&
    data.dayIndex !== null &&
    !!data.turnstileSiteKey &&
    !todayRecord &&
    !refreshing &&
    !status.error
  const closedDays = data?.phase === 'ended' ? 30 : (data?.dayIndex ?? 0)
  const hasMissedDay =
    records.reduce((count, record) => count + Number(record.dayIndex < closedDays), 0) < closedDays

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
      const response = await apiPost<SubmitCheckInResponse>('/api/check-in', input)
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
      <section className="border-y border-border py-6" aria-labelledby="check-in-rules-title">
        <h2 id="check-in-rules-title" className="font-serif text-xl text-ink">
          每天一笔，三十日相聚
        </h2>
        <p className="mt-3 text-sm leading-7 text-ink-muted">
          活动时间：北京时间2026年10月7日05:00至11月6日05:00。10月7日至11月5日共30个签到日，每日05:00更新；11月6日05:00截止并公示排名。
        </p>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm leading-7 text-ink-muted">
          <li>仅已登录且未封禁的用户可签到，每日一次，需完成人机验证，不可补签。</li>
          <li>
            签满全部30天才参与获奖排名，平均签到时间越早越优；并列第一共同获得
            {data?.event.rewardLabel ?? '活动奖励'}，由人工发放。
          </li>
          <li>
            凌晨按加24小时的延长时钟计分：当日06:00记06:00，次日01:00记25:00。平均值可超过24小时，显示四舍五入到秒，排名按未舍入总分计算。
          </li>
          <li>活动期间仅能查看自己的进度与均值，最终排名在活动结束后公开。</li>
        </ul>
      </section>

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
          <p className="text-sm text-ink-muted">
            签到活动尚未开始，请于北京时间10月7日05:00后再来。
          </p>
        ) : data?.phase === 'ended' ? (
          <p className="text-sm text-ink-muted">
            签到活动已结束，感谢每一天的相聚。最终排名见下方公示。
          </p>
        ) : !user ? (
          <>
            <p className="text-sm text-ink-muted">登录后即可参与签到，并查看自己的30天进度。</p>
            <LinkButton to="/login?redirect=%2Fcheck-in">登录后签到</LinkButton>
          </>
        ) : user.status === 'banned' ? (
          <p className="text-sm text-danger">账号已被封禁，无法参与签到。</p>
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
              今日签到日：{getCheckInDateLabel(data.dayIndex!)}
              。完成人机验证后提交，以服务端验证完成时间计分。
            </p>
            <TurnstileChallenge
              key={`${user.uid}:${data.dayIndex}`}
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

      <section className="flex flex-col gap-4" aria-labelledby="check-in-progress-title">
        <h2 id="check-in-progress-title" className="font-serif text-xl text-ink">
          30天进度
        </h2>
        {user && data?.me ? (
          <div className="space-y-2 text-sm text-ink-muted">
            <p>
              已签{data.me.completedDays}/30 · 个人平均签到时间：
              <span className="font-mono">
                {data.me.averageTimeSeconds === null
                  ? '暂无'
                  : formatCheckInScore(data.me.averageTimeSeconds)}
              </span>
            </p>
            {data.me.eligible ? (
              <p className="text-accent">已签满30天，具备获奖排名资格。</p>
            ) : hasMissedDay ? (
              <p>已有漏签，无法达成获奖条件；活动期间仍可继续签到。</p>
            ) : (
              <p>签满30天后参与获奖排名。</p>
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
              const label = getCheckInDayStatus(dayIndex, data.phase, data.dayIndex, !!record)
              return (
                <li
                  key={dayIndex}
                  className={`min-w-0 rounded-xl border p-2 text-center text-xs ${record ? 'border-accent/40 bg-accent-soft text-accent' : label === '漏签' ? 'border-border text-ink-muted' : 'border-border text-ink'}`}
                >
                  {record ? (
                    <details>
                      <summary className="cursor-pointer list-none space-y-2">
                        <span className="block">{getCheckInDateLabel(dayIndex)}</span>
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
                      <span className="block">{getCheckInDateLabel(dayIndex)}</span>
                      <span className="mt-2 block font-medium">{label}</span>
                    </>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {data?.phase === 'ended' ? (
        <CheckInRankings />
      ) : (
        <section className="border-t border-border pt-6">
          <h2 className="font-serif text-xl text-ink">签到排名</h2>
          <p className="mt-3 text-sm text-ink-muted">活动结束后公示排名</p>
        </section>
      )}
    </div>
  )
}

export default function CheckIn() {
  const { user } = useAuth()
  const { config } = useSiteConfig()
  return (
    <div className="mx-auto w-full max-w-6xl px-4">
      <header className="flex flex-col items-center gap-4 py-12 text-center md:py-16">
        <p className="font-serif text-4xl tracking-[0.2em] text-ink md:text-5xl">{config.name}</p>
        <PageHeader title="30天签到" className="font-serif" />
        <p className="text-sm text-ink-muted">让每一天的相聚，在清浅留下时间的印记。</p>
      </header>
      {/* 切换账号时销毁个人快照及挑战，不能沿用上一位用户的 token。 */}
      <CheckInEvent key={user?.uid ?? 'guest'} />
    </div>
  )
}
