/// <reference lib="es2024.promise" />

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../../src/components/Toast'
import { AuthProvider, useAuth } from '../../src/context/AuthContext'
import { formatCheckInScore, getCheckInDateLabel } from '../../src/lib/checkIn'
import { AppError } from '../../src/lib/errorHandler'
import CheckIn from '../../src/pages/CheckIn'
import type {
  CheckInRankingResponse,
  CheckInStatusResponse,
  SubmitCheckInResponse,
} from '../../src/types/api'
import { getCheckInDayWindows } from '../../src/lib/checkInSchedule'
import type { AuthUser } from '../../src/types/entities'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiRequest: vi.fn(),
  fetchCurrentUser: vi.fn(),
}))

vi.mock('../../src/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiRequest: mocks.apiRequest,
}))
vi.mock('../../src/lib/auth', () => ({
  fetchCurrentUser: mocks.fetchCurrentUser,
  logoutRequest: vi.fn(),
}))

type WidgetOptions = {
  callback: (token: string) => void
  'expired-callback': () => void
  'error-callback': () => void
  'timeout-callback': () => void
}

const user: AuthUser = {
  uid: 'participant-a',
  email: 'a@example.com',
  displayName: '清浅来客',
  bio: '',
  role: 'user',
  status: 'active',
  banReason: null,
  bannedAt: null,
  avatarUrl: null,
}
const event: CheckInStatusResponse['event'] = {
  id: '2026-11-22',
  debug: false,
  archived: false,
  startsOn: '2026-11-22',
  endsOn: '2026-12-22',
  startsAt: '2026-11-21T16:00:00.000Z',
  endsAt: '2026-12-22T15:59:00.000Z',
  rankingsAvailableAt: '2026-12-22T15:59:00.000Z',
  days: 30,
  fixedRefreshMinute: null,
  scoreMode: 'elapsed',
  rewardMode: 'possible',
}
const oldEvent: CheckInStatusResponse['event'] = {
  id: '2026-10-07',
  debug: false,
  archived: true,
  startsOn: '2026-10-07',
  endsOn: '2026-11-06',
  startsAt: '2026-10-06T21:00:00.000Z',
  endsAt: '2026-11-05T21:00:00.000Z',
  rankingsAvailableAt: '2026-11-05T21:00:00.000Z',
  days: 30,
  fixedRefreshMinute: 300,
  scoreMode: 'extended_clock',
  rewardMode: 'first_place',
}
const record = { dayIndex: 0, checkedInAt: '2026-11-21T22:00:00.000Z', scoreSeconds: 3600 }
let currentStatus: CheckInStatusResponse
let ranking: CheckInRankingResponse
let widgets: WidgetOptions[]
let pendingStatus: Promise<CheckInStatusResponse> | null

function AccountSwitch() {
  const { refreshAuth } = useAuth()
  return <button onClick={() => void refreshAuth()}>切换测试账号</button>
}

function renderPage(initialEntry = '/check-in') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <AuthProvider>
          <CheckIn />
          <AccountSwitch />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  pendingStatus = null
  widgets = []
  currentStatus = {
    event,
    events: [event, oldEvent],
    serverNow: '2026-11-21T22:00:00.000Z',
    phase: 'active',
    dayIndex: 0,
    nextTransitionAt: '2026-11-22T21:00:00.000Z',
    turnstileSiteKey: 'configured-site-key',
    me: {
      records: [],
      completedDays: 0,
      averageTimeSeconds: null,
      eligible: false,
      wechat: null,
      initialRefreshMinute: 300,
      refreshMinute: 300,
      refreshChanges: [],
      dayWindows: getCheckInDayWindows(event, 300, []),
      missedDayIndexes: [],
      phase: 'active',
      dayIndex: 0,
      dayStartsAt: '2026-11-21T21:00:00.000Z',
      nextTransitionAt: '2026-11-22T21:00:00.000Z',
    },
  }
  ranking = { items: [], total: 0, page: 1, pageSize: 24, qualifiedTotal: 0 }
  mocks.fetchCurrentUser.mockResolvedValue(user)
  mocks.apiPost.mockResolvedValue({ record })
  mocks.apiGet.mockImplementation((path: string) => {
    if (path === '/api/config/public')
      return Promise.resolve({
        name: '清浅 Wiki',
        registrationOpen: true,
        uploadMaxFileSizeMB: null,
      })
    if (path === '/api/check-in') return pendingStatus ?? Promise.resolve(currentStatus)
    if (path === '/api/check-in/rankings') return Promise.resolve(ranking)
    throw new Error(`未预期的接口：${path}`)
  })
  Object.defineProperty(window, 'turnstile', {
    configurable: true,
    value: {
      render: vi.fn((_container: HTMLElement, options: WidgetOptions) => {
        widgets.push(options)
        return `widget-${widgets.length}`
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'turnstile')
})

describe('签到页面', () => {
  it('未完成人机验证不可提交，token过期后禁用并可重新验证', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: '签到' })
    await waitFor(() => expect(widgets).toHaveLength(1))
    expect(button).toBeDisabled()
    act(() => widgets[0].callback('valid-token'))
    expect(button).toBeEnabled()
    act(() => widgets[0]['expired-callback']())
    expect(button).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('人机验证已过期')
    fireEvent.click(screen.getByRole('button', { name: '重新验证' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(button).toBeDisabled()
    act(() => widgets[0].callback('renewed-token'))
    expect(button).toBeEnabled()
  })

  it('提交失败展示服务端错误并消费旧token，再验证才能重试', async () => {
    mocks.apiPost.mockRejectedValueOnce(new AppError('人机验证服务暂不可用，请稍后重试', 503))
    renderPage()
    const button = await screen.findByRole('button', { name: '签到' })
    await waitFor(() => expect(widgets).toHaveLength(1))
    act(() => widgets[0].callback('first-token'))
    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('人机验证服务暂不可用')
    expect(button).toBeDisabled()
    expect(screen.getByText(/已签0\/30/)).toBeInTheDocument()
    act(() => widgets[0].callback('second-token'))
    expect(button).toBeEnabled()
  })

  it('提交中不能重复点击，成功立即反馈并刷新个人进度', async () => {
    const submission = Promise.withResolvers<SubmitCheckInResponse>()
    mocks.apiPost.mockReturnValueOnce(submission.promise)
    renderPage()
    const button = await screen.findByRole('button', { name: '签到' })
    await waitFor(() => expect(widgets).toHaveLength(1))
    act(() => widgets[0].callback('valid-token'))
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: '正在签到…' })).toBeDisabled()
    currentStatus = {
      ...currentStatus,
      me: {
        ...currentStatus.me!,
        records: [record],
        completedDays: 1,
        averageTimeSeconds: 3600,
        eligible: false,
        wechat: null,
      },
    }
    await act(async () => {
      submission.resolve({ record })
    })
    expect(await screen.findByText(/签到成功：北京时间2026-11-22 06:00:00/)).toBeInTheDocument()
    expect(await screen.findByText(/已签1\/30/)).toHaveTextContent('01:00:00')
    expect(await screen.findByText(/今日已签到/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '签到' })).not.toBeInTheDocument()
  })

  it('05:00切日时先禁用旧动作，刷新后旧挑战不能交付token', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
    })
    currentStatus = { ...currentStatus, serverNow: '2026-11-22T20:59:58.000Z' }
    renderPage()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    const oldWidget = widgets[0]
    expect(oldWidget).toBeDefined()
    act(() => oldWidget.callback('yesterday-token'))
    expect(screen.getByRole('button', { name: '签到' })).toBeEnabled()
    const refreshedStatus = Promise.withResolvers<CheckInStatusResponse>()
    pendingStatus = refreshedStatus.promise
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(screen.getByText('正在刷新签到状态…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '签到' })).not.toBeInTheDocument()
    currentStatus = {
      ...currentStatus,
      serverNow: '2026-11-22T21:00:00.000Z',
      dayIndex: 1,
      nextTransitionAt: '2026-11-23T21:00:00.000Z',
      me: { ...currentStatus.me!, missedDayIndexes: [0] },
    }
    await act(async () => {
      refreshedStatus.resolve(currentStatus)
    })
    const newButton = screen.getByRole('button', { name: '签到' })
    expect(newButton).toBeDisabled()
    expect(screen.getByText(/今日签到日：11月23日/)).toBeInTheDocument()
    expect(screen.getByText(/已有漏签，尚未签满30天/)).toBeInTheDocument()
    act(() => oldWidget.callback('stale-token'))
    expect(newButton).toBeDisabled()
    act(() => widgets.at(-1)!.callback('today-token'))
    expect(newButton).toBeEnabled()
  })

  it('刷新过程中不可沿用旧数据提交，窗口切换回前台会刷新', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: '签到' })
    await waitFor(() => expect(widgets).toHaveLength(1))
    act(() => widgets[0].callback('old-token'))
    const refreshedStatus = Promise.withResolvers<CheckInStatusResponse>()
    pendingStatus = refreshedStatus.promise
    fireEvent.focus(window)
    expect(screen.queryByRole('button', { name: '签到' })).not.toBeInTheDocument()
    expect(screen.getByText('正在刷新签到状态…')).toBeInTheDocument()
    currentStatus = {
      ...currentStatus,
      me: {
        ...currentStatus.me!,
        records: [record],
        completedDays: 1,
        averageTimeSeconds: record.scoreSeconds,
        eligible: false,
        wechat: null,
      },
    }
    await act(async () => {
      refreshedStatus.resolve(currentStatus)
    })
    expect(await screen.findByText(/今日已签到/)).toBeInTheDocument()
    expect(button).not.toBeInTheDocument()
  })

  it('账号切换销毁旧个人快照与token', async () => {
    renderPage()
    const button = await screen.findByRole('button', { name: '签到' })
    await waitFor(() => expect(widgets).toHaveLength(1))
    act(() => widgets[0].callback('old-user-token'))
    expect(button).toBeEnabled()
    mocks.fetchCurrentUser.mockResolvedValue({ ...user, uid: 'participant-b' })
    currentStatus = {
      ...currentStatus,
      me: {
        ...currentStatus.me!,
        records: [record],
        completedDays: 1,
        averageTimeSeconds: 3600,
        eligible: false,
        wechat: null,
      },
    }
    fireEvent.click(screen.getByRole('button', { name: '切换测试账号' }))
    expect(await screen.findByText(/今日已签到/)).toBeInTheDocument()
    expect(screen.getByText(/已签1\/30/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '签到' })).not.toBeInTheDocument()
  })

  it.each([
    ['游客', null, 'configured-site-key', '登录后签到'],
    [
      '封禁账号',
      { ...user, status: 'banned' as const },
      'configured-site-key',
      '账号已被封禁，无法参与签到。',
    ],
    ['未配置验证', user, null, '签到人机验证尚未配置，暂时无法签到。'],
  ] as const)('%s仅展示对应提示，不挂载挑战', async (_label, authUser, siteKey, expected) => {
    mocks.fetchCurrentUser.mockResolvedValue(authUser)
    currentStatus = { ...currentStatus, turnstileSiteKey: siteKey }
    renderPage()
    expect(await screen.findByText(expected)).toBeInTheDocument()
    if (!authUser)
      expect(screen.getByRole('link', { name: '登录后签到' })).toHaveAttribute(
        'href',
        '/login?redirect=%2Fcheck-in'
      )
    expect(screen.queryByRole('button', { name: '签到' })).not.toBeInTheDocument()
    expect(widgets).toHaveLength(0)
  })

  it('个人未开始不显示挑战与排名，规则说明刷新后耗时计分', async () => {
    currentStatus = {
      ...currentStatus,
      phase: 'upcoming',
      dayIndex: null,
      serverNow: '2026-11-21T20:00:00.000Z',
      nextTransitionAt: currentStatus.me!.dayWindows[0].startsAt,
    }
    renderPage()
    expect(await screen.findByText(/签到活动尚未开始/)).toBeInTheDocument()
    expect(screen.getByText(/按个人每日刷新后耗时计分/)).toBeInTheDocument()
    expect(screen.getByText('活动结束后公示排名')).toBeInTheDocument()
    expect(screen.queryByText('最终签到排名')).not.toBeInTheDocument()
    expect(mocks.apiGet.mock.calls.some(([path]) => path === '/api/check-in/rankings')).toBe(false)
    expect(widgets).toHaveLength(0)
  })

  it('状态加载失败时不展示可提交的旧动作，重试后恢复签到', async () => {
    let unavailable = true
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === '/api/config/public')
        return Promise.resolve({
          name: '清浅 Wiki',
          registrationOpen: true,
          uploadMaxFileSizeMB: null,
        })
      if (path === '/api/check-in' && unavailable)
        return Promise.reject(new AppError('签到状态暂不可用', 503))
      return Promise.resolve(currentStatus)
    })
    renderPage()
    expect(await screen.findByText('签到状态暂不可用')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '签到' })).not.toBeInTheDocument()
    unavailable = false
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('button', { name: '签到' })).toBeDisabled()
  })

  it('排名加载失败保持明确错误，重试后展示真实榜单数据', async () => {
    currentStatus = {
      ...currentStatus,
      event: oldEvent,
      phase: 'ended',
      dayIndex: null,
      nextTransitionAt: null,
      serverNow: oldEvent.endsAt,
    }
    let unavailable = true
    mocks.apiGet.mockImplementation((path: string) => {
      if (path === '/api/config/public')
        return Promise.resolve({
          name: '清浅 Wiki',
          registrationOpen: true,
          uploadMaxFileSizeMB: null,
        })
      if (path === '/api/check-in') return Promise.resolve(currentStatus)
      if (unavailable) return Promise.reject(new AppError('最终排名暂不可用', 503))
      return Promise.resolve(ranking)
    })
    renderPage()
    expect(await screen.findByText('最终排名暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('本次活动暂无签到记录')).not.toBeInTheDocument()
    unavailable = false
    ranking = {
      ...ranking,
      total: 1,
      qualifiedTotal: 1,
      items: [
        {
          userUid: 'winner',
          displayName: '获奖来客',
          completedDays: 30,
          averageTimeSeconds: 18000,
          rank: 1,
          winner: true,
        },
      ],
    }
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('获奖来客')).toBeInTheDocument()
    expect(screen.getByText('获奖来客').closest('tr')).toHaveTextContent('获奖')
  })

  it('实际凌晨时间与25:00:00计分同时展示，漏签后仍可签到', async () => {
    currentStatus = {
      ...currentStatus,
      dayIndex: 2,
      serverNow: '2026-11-23T22:00:00.000Z',
      nextTransitionAt: '2026-11-24T21:00:00.000Z',
      me: {
        ...currentStatus.me!,
        missedDayIndexes: [0],
        records: [{ dayIndex: 1, checkedInAt: '2026-11-23T17:00:00.000Z', scoreSeconds: 72000 }],
        completedDays: 1,
        averageTimeSeconds: 72000,
        eligible: false,
        wechat: null,
      },
    }
    renderPage()
    expect(await screen.findByRole('button', { name: '签到' })).toBeDisabled()
    expect(screen.getByText(/已有漏签/)).toBeInTheDocument()
    const signedDay = screen.getByText('已签 · 明细').closest('details')!
    fireEvent.click(within(signedDay).getByText('已签 · 明细'))
    expect(within(signedDay).getByText('2026-11-24 01:00:00')).toBeInTheDocument()
    expect(within(signedDay).getByText('20:00:00')).toBeInTheDocument()
  })

  it('409今日已签会同步首次记录，而非继续用旧token提交', async () => {
    mocks.apiPost.mockRejectedValueOnce(
      new AppError('今日已签到', 409, { code: 'CHECK_IN_ALREADY_DONE' })
    )
    renderPage()
    const button = await screen.findByRole('button', { name: '签到' })
    await waitFor(() => expect(widgets).toHaveLength(1))
    act(() => widgets[0].callback('valid-token'))
    currentStatus = {
      ...currentStatus,
      me: {
        ...currentStatus.me!,
        records: [record],
        completedDays: 1,
        averageTimeSeconds: 3600,
        eligible: false,
        wechat: null,
      },
    }
    fireEvent.click(button)
    expect(await screen.findByText(/今日已签到：北京时间2026-11-22 06:00:00/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('今日已签到')
    expect(screen.queryByRole('button', { name: '签到' })).not.toBeInTheDocument()
  })

  it('结束后游客可见并列获奖和未签满，第二页按实际total加载', async () => {
    mocks.fetchCurrentUser.mockResolvedValue(null)
    currentStatus = {
      ...currentStatus,
      event: oldEvent,
      phase: 'ended',
      dayIndex: null,
      nextTransitionAt: null,
      serverNow: oldEvent.endsAt,
      me: null,
    }
    ranking = {
      items: [
        {
          userUid: 'a',
          displayName: '并列甲',
          completedDays: 30,
          averageTimeSeconds: 18000,
          rank: 1,
          winner: true,
        },
        {
          userUid: 'b',
          displayName: '并列乙',
          completedDays: 30,
          averageTimeSeconds: 18000,
          rank: 1,
          winner: true,
        },
        {
          userUid: 'c',
          displayName: '未满丙',
          completedDays: 29,
          averageTimeSeconds: null,
          rank: null,
          winner: false,
        },
      ],
      total: 25,
      page: 1,
      pageSize: 24,
      qualifiedTotal: 2,
    }
    renderPage()
    await screen.findByText('并列甲')
    for (const name of ['并列甲', '并列乙']) {
      const row = screen.getByText(name).closest('tr')!
      expect(within(row).getByText('1')).toBeInTheDocument()
      expect(within(row).getByText('获奖', { exact: true })).toBeInTheDocument()
      expect(within(row).getByText('05:00:00')).toBeInTheDocument()
    }
    expect(screen.getByText('未满丙').closest('tr')).toHaveTextContent('未签满，不参与获奖排名')
    ranking = {
      ...ranking,
      page: 2,
      items: [
        {
          userUid: 'last',
          displayName: '末页参与者',
          completedDays: 1,
          averageTimeSeconds: null,
          rank: null,
          winner: false,
        },
      ],
    }
    await waitFor(() => expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('末页参与者')).toBeInTheDocument()
    expect(screen.queryByText('并列甲')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('button', { name: '签到' })).not.toBeInTheDocument()
  })

  it.each([false, true])('结束后明确展示空榜或无合格者（有参与者：%s）', async (hasParticipant) => {
    currentStatus = {
      ...currentStatus,
      event: oldEvent,
      phase: 'ended',
      dayIndex: null,
      nextTransitionAt: null,
      serverNow: oldEvent.endsAt,
    }
    if (hasParticipant)
      ranking = {
        ...ranking,
        total: 1,
        items: [
          {
            userUid: 'a',
            displayName: '仅签一天',
            completedDays: 1,
            averageTimeSeconds: null,
            rank: null,
            winner: false,
          },
        ],
      }
    renderPage()
    expect(
      await screen.findByText(
        hasParticipant ? '本次活动无人签满30天，无获奖者。' : '本次活动暂无签到记录'
      )
    ).toBeInTheDocument()
  })
  it('登录用户可在活动页面提交与修改微信号', async () => {
    currentStatus = {
      ...currentStatus,
      me: {
        ...currentStatus.me!,
        records: [],
        completedDays: 0,
        averageTimeSeconds: null,
        eligible: false,
        wechat: null,
      },
    }
    mocks.apiRequest.mockResolvedValueOnce({ wechat: 'wx_qianqian_test' })
    renderPage()
    await screen.findByText('发奖联系方式')
    const input = screen.getByLabelText('微信号')
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: 'wx_qianqian_test' } })
    fireEvent.click(screen.getByRole('button', { name: '保存微信号' }))
    await waitFor(() =>
      expect(mocks.apiRequest).toHaveBeenCalledWith('/api/check-in/wechat?eventId=2026-11-22', {
        method: 'PUT',
        body: { wechat: 'wx_qianqian_test' },
      })
    )
  })
})

describe('签到展示格式', () => {
  it('超过24小时不取模，均值只在展示时四舍五入', () => {
    expect(formatCheckInScore(90000)).toBe('25:00:00')
    expect(formatCheckInScore(104399)).toBe('28:59:59')
    expect(formatCheckInScore(21599.6)).toBe('06:00:00')
    expect(getCheckInDateLabel(0, '2026-10-07')).toBe('10月7日')
    expect(getCheckInDateLabel(29, '2026-10-07')).toBe('11月5日')
  })
})
