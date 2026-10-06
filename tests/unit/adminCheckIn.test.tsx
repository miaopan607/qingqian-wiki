/// <reference lib="es2024.promise" />

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RouteGuard } from '../../src/components/RouteGuard'
import { ToastProvider } from '../../src/components/Toast'
import { AuthProvider } from '../../src/context/AuthContext'
import { AppError } from '../../src/lib/errorHandler'
import AdminCheckIn from '../../src/pages/admin/AdminCheckIn'
import type { AdminCheckInResponse } from '../../src/types/api'
import type { AdminCheckInParticipant, AuthUser } from '../../src/types/entities'

const mocks = vi.hoisted(() => ({ apiGet: vi.fn(), fetchCurrentUser: vi.fn() }))
vi.mock('../../src/lib/apiClient', () => ({ apiGet: mocks.apiGet }))
vi.mock('../../src/lib/auth', () => ({
  fetchCurrentUser: mocks.fetchCurrentUser,
  logoutRequest: vi.fn(),
}))

const admin: AuthUser = {
  uid: 'admin-a',
  email: 'admin@example.com',
  displayName: '普通管理员',
  bio: '',
  role: 'admin',
  status: 'active',
  banReason: null,
  bannedAt: null,
  avatarUrl: null,
}
const participant: AdminCheckInParticipant = {
  userUid: 'participant-a',
  displayName: '早春',
  userStatus: 'active',
  completedDays: 3,
  averageTimeSeconds: 43200,
  state: 'in_progress',
  missedDayIndexes: [],
  rank: null,
  winner: false,
  records: [
    { dayIndex: 0, checkedInAt: '2026-10-06T22:00:00.000Z', scoreSeconds: 21600 },
    { dayIndex: 1, checkedInAt: '2026-10-08T17:00:00.000Z', scoreSeconds: 90000 },
    { dayIndex: 2, checkedInAt: '2026-10-08T21:00:00.000Z', scoreSeconds: 18000 },
  ],
}
const missedParticipant: AdminCheckInParticipant = {
  userUid: 'participant-b',
  displayName: '晚秋',
  userStatus: 'banned',
  completedDays: 1,
  averageTimeSeconds: 25200,
  state: 'missed',
  missedDayIndexes: [0],
  rank: null,
  winner: false,
  records: [{ dayIndex: 1, checkedInAt: '2026-10-07T23:00:00.000Z', scoreSeconds: 25200 }],
}
let currentSnapshot: AdminCheckInResponse
let responseError: Error | null
let pendingSnapshot: Promise<AdminCheckInResponse> | null

function renderPage(initialEntry = '/admin/check-in') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route
              path="/admin/check-in"
              element={
                <RouteGuard requireAdmin>
                  <AdminCheckIn />
                </RouteGuard>
              }
            />
            <Route path="/login" element={<p>请登录后台</p>} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  )
}

function readSummary(label: string): HTMLElement {
  return screen.getByText(label, { selector: 'dt' }).parentElement!
}

beforeEach(() => {
  vi.clearAllMocks()
  responseError = null
  pendingSnapshot = null
  currentSnapshot = {
    event: {
      id: '2026-10-07',
      startsAt: '2026-10-06T21:00:00.000Z',
      endsAt: '2026-11-05T21:00:00.000Z',
      days: 30,
      rewardLabel: '活动奖励',
    },
    snapshotAt: '2026-10-08T22:00:00.000Z',
    phase: 'active',
    dayIndex: 2,
    summary: {
      participants: 2,
      totalCheckIns: 4,
      completedParticipants: 0,
      missedParticipants: 1,
      inProgressParticipants: 1,
      todayCheckIns: 1,
    },
    daily: Array.from({ length: 30 }, (_, dayIndex) => ({
      dayIndex,
      checkIns: [1, 2, 1][dayIndex] ?? 0,
      closed: dayIndex < 2,
    })),
    items: [participant, missedParticipant],
    total: 2,
    page: 1,
    pageSize: 24,
  }
  mocks.fetchCurrentUser.mockResolvedValue(admin)
  mocks.apiGet.mockImplementation((path: string) => {
    if (path !== '/api/admin/check-in') throw new Error(`未预期的接口：${path}`)
    if (responseError) return Promise.reject(responseError)
    return pendingSnapshot ?? Promise.resolve(currentSnapshot)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('后台签到快照', () => {
  it('普通管理员首次进入能读汇总、每日状态与真实凌晨签到明细', async () => {
    renderPage()
    await screen.findByText('早春')
    expect(screen.getByText('2026-10-09 06:00:00')).toBeInTheDocument()
    expect(readSummary('参与人数')).toHaveTextContent('2')
    expect(readSummary('累计签到')).toHaveTextContent('4')
    expect(readSummary('当前日签到')).toHaveTextContent('1')
    expect(readSummary('已漏签人数')).toHaveTextContent('1')
    const dailyTable = screen.getAllByRole('table')[0]
    expect(within(dailyTable).getAllByRole('row')).toHaveLength(31)
    expect(within(dailyTable).getByText('10月7日').closest('tr')).toHaveTextContent('已结束')
    expect(within(dailyTable).getByText('10月9日').closest('tr')).toHaveTextContent('进行中')
    expect(within(dailyTable).getByText('11月5日').closest('tr')).toHaveTextContent('未开始')
    expect(screen.getByText('早春').closest('tr')).toHaveTextContent('12:00:00')
    expect(screen.getByText('早春').closest('tr')).toHaveTextContent('活动结束后确定')
    fireEvent.click(screen.getByRole('button', { name: '查看 早春 的明细' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('2026-10-09 01:00:00')).toBeInTheDocument()
    expect(within(dialog).getByText('25:00:00')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('row')).toHaveLength(31)
    expect(within(dialog).getByText('第3天 · 10月9日').closest('tr')).toHaveTextContent('已签')
    expect(within(dialog).getByText('第30天 · 11月5日').closest('tr')).toHaveTextContent('未到')
    fireEvent.click(within(dialog).getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: '查看 晚秋 的明细' }))
    const missedDialog = await screen.findByRole('dialog')
    expect(within(missedDialog).getByText('第1天 · 10月7日').closest('tr')).toHaveTextContent(
      '漏签'
    )
    expect(within(missedDialog).getByText('第3天 · 10月9日').closest('tr')).toHaveTextContent(
      '今日待签'
    )
  })

  it('实际total驱动第二页，翻页关闭旧明细并展示新页内容', async () => {
    currentSnapshot = { ...currentSnapshot, total: 25 }
    renderPage()
    await screen.findByText('早春')
    fireEvent.click(screen.getByRole('button', { name: '查看 早春 的明细' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    currentSnapshot = {
      ...currentSnapshot,
      page: 2,
      items: [{ ...participant, userUid: 'participant-last', displayName: '最后一位' }],
    }
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('最后一位')).toBeInTheDocument()
    expect(screen.queryByText('早春')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
  })

  it('手动刷新替换整份快照，不让旧汇总和旧行明细混用', async () => {
    renderPage()
    await screen.findByText('早春')
    fireEvent.click(screen.getByRole('button', { name: '查看 早春 的明细' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    const request = Promise.withResolvers<AdminCheckInResponse>()
    pendingSnapshot = request.promise
    // 模态层隐藏了页面按钮；直接触发其交互以观察刷新时关闭旧详情。
    fireEvent.click(screen.getByText('刷新', { selector: 'button' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看 早春 的明细' })).toBeDisabled()
    expect(readSummary('累计签到')).toHaveTextContent('4')
    currentSnapshot = {
      ...currentSnapshot,
      snapshotAt: '2026-10-08T23:00:00.000Z',
      summary: { ...currentSnapshot.summary, participants: 3, totalCheckIns: 5 },
      items: [{ ...participant, displayName: '新快照用户' }],
      total: 3,
    }
    await act(async () => {
      request.resolve(currentSnapshot)
    })
    expect(await screen.findByText('2026-10-09 07:00:00')).toBeInTheDocument()
    expect(readSummary('参与人数')).toHaveTextContent('3')
    expect(readSummary('累计签到')).toHaveTextContent('5')
    expect(screen.getByText('新快照用户')).toBeInTheDocument()
    expect(screen.queryByText('早春')).not.toBeInTheDocument()
  })

  it('加载中保留旧快照但禁用明细，刷新失败保留截至时间和计数并可重试', async () => {
    renderPage()
    await screen.findByText('早春')
    responseError = new AppError('网络异常', 503)
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(screen.getByRole('button', { name: '查看 早春 的明细' })).toBeDisabled()
    expect(readSummary('累计签到')).toHaveTextContent('4')
    expect(await screen.findByRole('alert')).toHaveTextContent('刷新失败，当前仍为旧数据：网络异常')
    expect(screen.getByText('2026-10-09 06:00:00')).toBeInTheDocument()
    expect(readSummary('累计签到')).toHaveTextContent('4')
    expect(screen.getByText('早春')).toBeInTheDocument()
    expect(screen.queryByText('没有匹配的参与者')).not.toBeInTheDocument()
    responseError = null
    currentSnapshot = {
      ...currentSnapshot,
      snapshotAt: '2026-10-09T00:00:00.000Z',
      summary: { ...currentSnapshot.summary, totalCheckIns: 6 },
    }
    await waitFor(() => expect(screen.getByRole('button', { name: '重试' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('2026-10-09 08:00:00')).toBeInTheDocument()
    expect(readSummary('累计签到')).toHaveTextContent('6')
  })

  it('计时器、focus和visibilitychange不更新后台快照，只有手动刷新取新值', async () => {
    renderPage()
    await screen.findByText('早春')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    currentSnapshot = {
      ...currentSnapshot,
      snapshotAt: '2026-10-09T00:00:00.000Z',
      summary: { ...currentSnapshot.summary, totalCheckIns: 9 },
    }
    await act(async () => {
      fireEvent.focus(window)
      fireEvent(document, new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(readSummary('累计签到')).toHaveTextContent('4')
    expect(screen.getByText('2026-10-09 06:00:00')).toBeInTheDocument()
    expect(screen.queryByText('2026-10-09 08:00:00')).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    })
    expect(readSummary('累计签到')).toHaveTextContent('9')
    expect(screen.getByText('2026-10-09 08:00:00')).toBeInTheDocument()
  })

  it('搜索只在提交后加载，筛选后回到第一页且全局汇总不改变', async () => {
    currentSnapshot = { ...currentSnapshot, total: 25 }
    renderPage()
    await screen.findByText('早春')
    currentSnapshot = {
      ...currentSnapshot,
      page: 2,
      items: [{ ...participant, displayName: '第二页来客' }],
    }
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await screen.findByText('第二页来客')
    fireEvent.change(screen.getByLabelText('搜索昵称或完整UID'), { target: { value: '不存在' } })
    expect(screen.getByText('第二页来客')).toBeInTheDocument()
    currentSnapshot = { ...currentSnapshot, page: 1, total: 0, items: [] }
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('没有匹配的参与者')).toBeInTheDocument()
    expect(readSummary('参与人数')).toHaveTextContent('2')
    expect(readSummary('累计签到')).toHaveTextContent('4')
    currentSnapshot = { ...currentSnapshot, total: 1, items: [missedParticipant] }
    fireEvent.change(screen.getByLabelText('参与状态'), { target: { value: 'missed' } })
    expect(await screen.findByText('晚秋')).toBeInTheDocument()
    expect(screen.queryByText('早春')).not.toBeInTheDocument()
    expect(readSummary('参与人数')).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page')
  })

  it('结束后保留全榜名次与获奖标记，当前日签到显示不适用', async () => {
    currentSnapshot = {
      ...currentSnapshot,
      phase: 'ended',
      dayIndex: null,
      snapshotAt: '2026-11-05T21:00:00.000Z',
      summary: { ...currentSnapshot.summary, todayCheckIns: null },
      items: [
        { ...participant, completedDays: 30, state: 'completed', rank: 3, winner: false },
        {
          ...participant,
          userUid: 'winner',
          displayName: '并列第一',
          completedDays: 30,
          state: 'completed',
          rank: 1,
          winner: true,
        },
      ],
    }
    renderPage()
    await screen.findByText('早春')
    expect(readSummary('当前日签到')).toHaveTextContent('不适用')
    expect(screen.getByText('早春').closest('tr')).toHaveTextContent('3')
    expect(screen.getByText('并列第一').closest('tr')).toHaveTextContent('获奖')
    currentSnapshot = { ...currentSnapshot, total: 1, items: [currentSnapshot.items[0]] }
    fireEvent.change(screen.getByLabelText('搜索昵称或完整UID'), { target: { value: '早春' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(screen.queryByText('并列第一')).not.toBeInTheDocument())
    expect(
      within(screen.getByText('早春').closest('tr')!).getByText('3', { exact: true })
    ).toBeInTheDocument()
    expect(screen.queryByText('活动结束后确定')).not.toBeInTheDocument()
  })

  it('初次加载失败给出错误而非空活动', async () => {
    responseError = new AppError('活动快照暂不可用', 503)
    renderPage()
    expect(await screen.findByText('活动快照暂不可用')).toBeInTheDocument()
    expect(screen.queryByText('没有匹配的参与者')).not.toBeInTheDocument()
    expect(screen.queryByText('活动汇总')).not.toBeInTheDocument()
    responseError = null
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('早春')).toBeInTheDocument()
  })

  it('空活动保留零汇总和固定30日表，不编造参与者', async () => {
    currentSnapshot = {
      ...currentSnapshot,
      phase: 'upcoming',
      dayIndex: null,
      items: [],
      total: 0,
      summary: {
        participants: 0,
        totalCheckIns: 0,
        completedParticipants: 0,
        missedParticipants: 0,
        inProgressParticipants: 0,
        todayCheckIns: null,
      },
      daily: Array.from({ length: 30 }, (_, dayIndex) => ({
        dayIndex,
        checkIns: 0,
        closed: false,
      })),
    }
    renderPage()
    expect(await screen.findByText('没有匹配的参与者')).toBeInTheDocument()
    expect(readSummary('参与人数')).toHaveTextContent('0')
    expect(readSummary('当前日签到')).toHaveTextContent('不适用')
    expect(screen.getAllByRole('row')).toHaveLength(31)
    expect(screen.queryByRole('button', { name: /查看 .* 的明细/ })).not.toBeInTheDocument()
  })

  it.each([
    ['游客', null, '请登录后台'],
    ['普通用户', { ...admin, role: 'user' as const }, '没有访问权限'],
  ])('%s不能看到后台数据', async (_label, authUser, expected) => {
    mocks.fetchCurrentUser.mockResolvedValue(authUser)
    renderPage()
    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText('活动汇总')).not.toBeInTheDocument()
    expect(screen.queryByText('早春')).not.toBeInTheDocument()
  })

  it('封禁管理员收到后端拒绝，不展示参与者私人明细', async () => {
    mocks.fetchCurrentUser.mockResolvedValue({ ...admin, status: 'banned' })
    responseError = new AppError('账号已被封禁', 403, { code: 'USER_BANNED' })
    renderPage()
    expect(await screen.findByText('账号已被封禁')).toBeInTheDocument()
    expect(screen.queryByText('早春')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /查看 .* 的明细/ })).not.toBeInTheDocument()
  })
})
