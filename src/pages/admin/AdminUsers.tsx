import { KeyRound, Search, ShieldBan, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Pagination } from '../../components/Pagination'
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  EmptyState,
  ErrorState,
  Field,
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
  Textarea,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../context/AuthContext'
import { useAsyncData } from '../../hooks/useAsyncData'
import { usePagination } from '../../hooks/usePagination'
import { apiGet, apiPatch, apiPost } from '../../lib/apiClient'
import { getErrorMessage } from '../../lib/errorHandler'
import { formatDateTime } from '../../lib/format'
import type { AdminUserListResponse } from '../../types/api'
import type { AdminUserItem } from '../../types/entities'

const PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [10, 20, 50]
const PASSWORD_MIN_LENGTH = 8

const ROLE_LABEL: Record<AdminUserItem['role'], string> = {
  user: '普通用户',
  admin: '管理员',
  super_admin: '超级管理员',
}

export default function AdminUsers() {
  const { user: currentUser } = useAuth()
  const toast = useToast()

  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'' | AdminUserItem['role']>('')
  const [status, setStatus] = useState<'' | AdminUserItem['status']>('')

  const [banTarget, setBanTarget] = useState<AdminUserItem | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banPending, setBanPending] = useState(false)

  const [passwordTarget, setPasswordTarget] = useState<AdminUserItem | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [passwordPending, setPasswordPending] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const pagination = usePagination({
    total: 0,
    defaultPageSize: PAGE_SIZE,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  })

  const list = useAsyncData<AdminUserListResponse>(
    (signal) =>
      apiGet<AdminUserListResponse>(
        '/api/admin/users',
        {
          page: pagination.page,
          pageSize: pagination.pageSize,
          q: query || undefined,
          role: role || undefined,
          status: status || undefined,
        },
        signal
      ),
    [pagination.page, pagination.pageSize, query, role, status]
  )

  useEffect(() => {
    pagination.setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, role, status])

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize))

  const updateUser = async (uid: string, payload: Record<string, unknown>) => {
    try {
      await apiPatch(`/api/admin/users/${uid}`, payload)
      toast.show({ title: '用户已更新', tone: 'success' })
      list.reload()
    } catch (error) {
      toast.show({ title: '操作失败', description: getErrorMessage(error), tone: 'error' })
    }
  }

  const handleBan = async () => {
    if (!banTarget) return

    setBanPending(true)
    try {
      await apiPatch(`/api/admin/users/${banTarget.uid}`, {
        status: 'banned',
        banReason: banReason.trim() || undefined,
      })
      toast.show({ title: '已封禁该用户', tone: 'success' })
      setBanTarget(null)
      setBanReason('')
      list.reload()
    } catch (error) {
      toast.show({ title: '操作失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setBanPending(false)
    }
  }

  const handleResetPassword = async () => {
    if (!passwordTarget) return

    if (
      newPassword.length < PASSWORD_MIN_LENGTH ||
      !/[A-Za-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      setPasswordError(`密码至少 ${PASSWORD_MIN_LENGTH} 位，且需包含字母和数字`)
      return
    }

    setPasswordPending(true)
    setPasswordError(null)

    try {
      await apiPost(`/api/admin/users/${passwordTarget.uid}/password`, { password: newPassword })
      toast.show({ title: '密码已重置', description: '该用户的所有旧会话已失效', tone: 'success' })
      setPasswordTarget(null)
      setNewPassword('')
    } catch (error) {
      setPasswordError(getErrorMessage(error))
    } finally {
      setPasswordPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="用户管理" subtitle="封禁、角色调整与密码重置（仅超级管理员）" />

      <Panel className="flex flex-wrap items-end gap-3 p-4">
        <form
          className="flex flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            setQuery(keyword.trim())
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-xs text-ink-muted">搜索昵称或邮箱</span>
            <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} />
          </label>
          <Button type="submit" variant="outline" leftIcon={<Search className="size-4" />}>
            搜索
          </Button>
        </form>

        <label className="flex w-36 flex-col gap-1.5">
          <span className="text-xs text-ink-muted">角色</span>
          <Select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="">全部</option>
            <option value="user">普通用户</option>
            <option value="admin">管理员</option>
            <option value="super_admin">超级管理员</option>
          </Select>
        </label>

        <label className="flex w-36 flex-col gap-1.5">
          <span className="text-xs text-ink-muted">状态</span>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <option value="">全部</option>
            <option value="active">正常</option>
            <option value="banned">已封禁</option>
          </Select>
        </label>
      </Panel>

      <Panel className="p-0">
        {list.loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : list.error ? (
          <ErrorState message={getErrorMessage(list.error, '用户加载失败')} onRetry={list.reload} />
        ) : items.length === 0 ? (
          <EmptyState icon={Users} title="没有匹配的用户" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>昵称</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>图集</TableHead>
                <TableHead>注册时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isSelf = item.uid === currentUser?.uid

                return (
                  <TableRow key={item.uid}>
                    <TableCell className="font-medium">
                      {item.displayName}
                      {isSelf && <span className="ml-2 text-xs text-ink-muted">（我）</span>}
                    </TableCell>
                    <TableCell className="text-xs text-ink-muted">{item.email}</TableCell>
                    <TableCell>
                      <Select
                        className="h-8 w-32 text-xs"
                        aria-label={`修改 ${item.displayName} 的角色`}
                        value={item.role}
                        disabled={isSelf}
                        onChange={(event) =>
                          void updateUser(item.uid, { role: event.target.value })
                        }
                      >
                        {Object.entries(ROLE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell>
                      {item.status === 'banned' ? (
                        <Badge tone="danger">
                          已封禁
                          {item.banReason ? ` · ${item.banReason}` : ''}
                        </Badge>
                      ) : (
                        <Badge tone="accent">正常</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{item.galleriesCount}</TableCell>
                    <TableCell className="text-xs text-ink-muted">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {item.status === 'banned' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            leftIcon={<ShieldCheck className="size-4" />}
                            onClick={() => void updateUser(item.uid, { status: 'active' })}
                          >
                            解封
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSelf}
                            leftIcon={<ShieldBan className="size-4" />}
                            onClick={() => {
                              setBanTarget(item)
                              setBanReason('')
                            }}
                          >
                            封禁
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<KeyRound className="size-4" />}
                          onClick={() => {
                            setPasswordTarget(item)
                            setNewPassword('')
                            setPasswordError(null)
                          }}
                        >
                          重置密码
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={pagination.page}
        totalPages={totalPages}
        onPageChange={pagination.setPage}
        pageSize={pagination.pageSize}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={pagination.setPageSize}
      />

      <Dialog open={Boolean(banTarget)} onOpenChange={(open) => !open && setBanTarget(null)}>
        <DialogContent
          title={`封禁「${banTarget?.displayName ?? ''}」？`}
          description="封禁后该用户无法登录与进行任何写操作。"
          footer={
            <>
              <Button variant="ghost" onClick={() => setBanTarget(null)} disabled={banPending}>
                取消
              </Button>
              <Button variant="danger" loading={banPending} onClick={handleBan}>
                确认封禁
              </Button>
            </>
          }
        >
          <Field label="封禁原因" htmlFor="ban-reason" hint="会展示给被封禁的用户">
            <Textarea
              id="ban-reason"
              rows={3}
              maxLength={100}
              value={banReason}
              onChange={(event) => setBanReason(event.target.value)}
              placeholder="例如：发布违规内容"
            />
          </Field>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(passwordTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordTarget(null)
            setPasswordError(null)
          }
        }}
      >
        <DialogContent
          title={`重置「${passwordTarget?.displayName ?? ''}」的密码`}
          description="重置后该用户的所有登录状态会立即失效，需使用新密码重新登录。"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setPasswordTarget(null)}
                disabled={passwordPending}
              >
                取消
              </Button>
              <Button loading={passwordPending} onClick={handleResetPassword}>
                确认重置
              </Button>
            </>
          }
        >
          <Field
            label="新密码"
            htmlFor="new-password"
            required
            error={passwordError}
            hint={`至少 ${PASSWORD_MIN_LENGTH} 位，需包含字母和数字`}
          >
            <Input
              id="new-password"
              type="text"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="输入新密码并告知用户"
            />
          </Field>
        </DialogContent>
      </Dialog>
    </div>
  )
}
