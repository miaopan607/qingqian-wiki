import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { Navbar } from '../../src/components/Navbar'
import type { AuthUser } from '../../src/types/entities'
import type { PublicConfigResponse } from '../../src/types/api'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useSiteConfig: vi.fn(),
}))

vi.mock('../../src/context/AuthContext', () => ({ useAuth: mocks.useAuth }))
vi.mock('../../src/hooks/useSiteConfig', () => ({ useSiteConfig: mocks.useSiteConfig }))

const user: AuthUser = {
  uid: 'menu-user',
  email: 'menu@example.com',
  displayName: '菜单测试用户',
  bio: '',
  role: 'user',
  status: 'active',
  banReason: null,
  bannedAt: null,
  avatarUrl: null,
}

const config: PublicConfigResponse = {
  name: '清浅 Wiki',
  registrationOpen: true,
  uploadMaxFileSizeMB: null,
}

function renderNavbar() {
  return render(
    <MemoryRouter initialEntries={['/gallery']}>
      <Navbar />
      <Routes>
        <Route path="/gallery" element={<p>美图页面内容</p>} />
        <Route path="/me" element={<p>个人中心页面内容</p>} />
        <Route path="/login" element={<p>登录页面内容</p>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useSiteConfig.mockReturnValue({ config, loading: false })
  mocks.useAuth.mockReturnValue({
    user,
    isAdmin: false,
    isSuperAdmin: false,
    isBanned: false,
    refreshAuth: vi.fn(),
    logout: vi.fn(),
  })
})

describe('Navbar mobile menu', () => {
  it('登录用户展开后可关闭、跳转个人中心，导航收起且页面继续显示', () => {
    renderNavbar()

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    let navigation = within(screen.getByRole('navigation', { name: '移动端导航' }))
    for (const label of ['美图', '键帽', '签到', '个人中心']) {
      expect(navigation.getByRole('link', { name: label })).toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: '关闭菜单' }))
    expect(screen.queryByRole('navigation', { name: '移动端导航' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    navigation = within(screen.getByRole('navigation', { name: '移动端导航' }))
    fireEvent.click(navigation.getByRole('link', { name: '个人中心' }))

    expect(screen.getByText('个人中心页面内容')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '移动端导航' })).not.toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByText('个人中心页面内容')).toBeInTheDocument()
  })

  it('游客可从展开菜单进入登录页并自动收起菜单', () => {
    mocks.useAuth.mockReturnValue({
      user: null,
      isAdmin: false,
      isSuperAdmin: false,
      isBanned: false,
      refreshAuth: vi.fn(),
      logout: vi.fn(),
    })
    renderNavbar()

    fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
    const navigation = within(screen.getByRole('navigation', { name: '移动端导航' }))
    expect(navigation.getByRole('link', { name: '登录' })).toBeInTheDocument()
    expect(navigation.getByRole('link', { name: '注册' })).toBeInTheDocument()
    fireEvent.click(navigation.getByRole('link', { name: '登录' }))

    expect(screen.getByText('登录页面内容')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '移动端导航' })).not.toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
})
