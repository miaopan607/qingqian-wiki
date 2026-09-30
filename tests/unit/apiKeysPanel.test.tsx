import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ToastProvider } from '../../src/components/Toast'
import { ApiKeysPanel } from '../../src/components/ApiKeysPanel'

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
  invalidateCacheByPrefix: vi.fn(),
}))

vi.mock('../../src/lib/apiClient', () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  apiDelete: mocks.apiDelete,
}))

vi.mock('../../src/lib/requestDedup', () => ({
  invalidateCacheByPrefix: mocks.invalidateCacheByPrefix,
}))

const activeKey = {
  id: 'key-1',
  name: '发布脚本',
  tokenPrefix: 'qq_api_1234567',
  scope: 'read_write' as const,
  createdAt: '2026-09-30T10:00:00.000Z',
  expiresAt: '2026-12-29T10:00:00.000Z',
  revokedAt: null,
  status: 'active' as const,
}

function renderPanel() {
  return render(
    <ToastProvider>
      <ApiKeysPanel />
    </ToastProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.apiGet.mockResolvedValue({ items: [] })
  mocks.apiPost.mockResolvedValue({
    apiKey: activeKey,
    token: 'qq_api_abcdefghijklmnopqrstuvwxyz0123456789ABCDE',
  })
  mocks.apiDelete.mockResolvedValue({ success: true })
})

describe('ApiKeysPanel', () => {
  it('创建后仅展示一次完整密钥，关闭后清除并按默认只读/90 天创建', async () => {
    renderPanel()
    await screen.findByText('尚无 API 密钥')
    fireEvent.change(screen.getByLabelText(/密钥名称/), { target: { value: '本地备份' } })
    fireEvent.click(screen.getByRole('button', { name: '创建密钥' }))

    const tokenField = await screen.findByRole('textbox', { name: '新 API 密钥' })
    expect(tokenField).toHaveValue('qq_api_abcdefghijklmnopqrstuvwxyz0123456789ABCDE')
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/me/api-keys', {
      name: '本地备份',
      scope: 'read',
      expiresInDays: 90,
    })
    expect(screen.getByRole('button', { name: '创建密钥' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '我已保存，关闭' }))
    expect(screen.queryByRole('textbox', { name: '新 API 密钥' })).not.toBeInTheDocument()
  })

  it('剪贴板不可用时保留可手动复制的密钥并显示错误提示', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    renderPanel()
    await screen.findByText('尚无 API 密钥')
    fireEvent.change(screen.getByLabelText(/密钥名称/), { target: { value: '部署脚本' } })
    fireEvent.click(screen.getByRole('button', { name: '创建密钥' }))
    const tokenField = await screen.findByRole('textbox', { name: '新 API 密钥' })

    fireEvent.click(screen.getByRole('button', { name: '复制密钥' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('无法访问剪贴板')
    expect(tokenField).toHaveValue('qq_api_abcdefghijklmnopqrstuvwxyz0123456789ABCDE')
    expect(writeText).toHaveBeenCalledWith('qq_api_abcdefghijklmnopqrstuvwxyz0123456789ABCDE')
  })

  it('创建失败保留输入名称并显示服务端错误', async () => {
    mocks.apiPost.mockRejectedValueOnce(new Error('服务暂不可用'))
    renderPanel()
    await screen.findByText('尚无 API 密钥')
    const nameField = screen.getByLabelText(/密钥名称/)
    fireEvent.change(nameField, { target: { value: '夜间同步' } })
    fireEvent.click(screen.getByRole('button', { name: '创建密钥' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('服务暂不可用')
    expect(nameField).toHaveValue('夜间同步')
    expect(screen.queryByRole('textbox', { name: '新 API 密钥' })).not.toBeInTheDocument()
  })

  it('撤销前需要确认，确认后密钥从列表消失', async () => {
    mocks.apiGet.mockResolvedValueOnce({ items: [activeKey] }).mockResolvedValueOnce({ items: [] })
    renderPanel()
    await screen.findByText('发布脚本')
    fireEvent.click(screen.getByRole('button', { name: '撤销' }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('撤销 API 密钥？')
    expect(mocks.apiDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))

    await waitFor(() => expect(mocks.apiDelete).toHaveBeenCalledWith('/api/me/api-keys/key-1'))
    await waitFor(() => expect(screen.queryByText('发布脚本')).not.toBeInTheDocument())
    expect(mocks.invalidateCacheByPrefix).toHaveBeenCalledWith('/api/me/api-keys')
  })
})
