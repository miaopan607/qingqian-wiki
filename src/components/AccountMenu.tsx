import { LayoutDashboard, LogOut, Settings, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui'

// 头像 + 下拉：个人中心、后台入口与退出登录
export function AccountMenu() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="账号菜单"
        >
          <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="px-3 py-2">
          <p className="truncate text-sm text-ink">{user.displayName}</p>
          <p className="truncate text-xs text-ink-muted">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/me')}>
          <span className="flex items-center gap-2">
            <User className="size-4" /> 个人中心
          </span>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem onSelect={() => navigate('/admin')}>
            <span className="flex items-center gap-2">
              <LayoutDashboard className="size-4" /> 管理后台
            </span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate('/me')}>
          <span className="flex items-center gap-2">
            <Settings className="size-4" /> 我的收藏
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          danger
          onSelect={() => {
            void logout().then(() => navigate('/'))
          }}
        >
          <span className="flex items-center gap-2">
            <LogOut className="size-4" /> 退出登录
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
