import {
  ArrowLeft,
  Image as ImageIcon,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { AccountMenu } from '../../components/AccountMenu'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Button, IconButton, cn } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { useSiteConfig } from '../../hooks/useSiteConfig'
import { clearRequestCache } from '../../lib/requestDedup'

type AdminNavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
  superAdminOnly?: boolean
}

const NAV_ITEMS: AdminNavItem[] = [
  { to: '/admin', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/admin/galleries', label: '美图管理', icon: ImageIcon },
  { to: '/admin/keycaps', label: '键帽管理', icon: Keyboard },
  { to: '/admin/users', label: '用户管理', icon: Users, superAdminOnly: true },
  { to: '/admin/settings', label: '站点设置', icon: Settings, superAdminOnly: true },
]

export default function AdminLayout() {
  const { config } = useSiteConfig()
  const { isSuperAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const items = NAV_ITEMS.filter((item) => !item.superAdminOnly || isSuperAdmin)

  const navList = (
    <nav className="flex flex-col gap-1" aria-label="后台导航">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setDrawerOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-accent-soft text-accent'
                : 'text-ink-muted hover:bg-surface-alt hover:text-ink'
            )
          }
        >
          <item.icon className="size-4" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-border bg-surface">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <IconButton
              aria-label="打开后台导航"
              className="md:hidden"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu className="size-5" />
            </IconButton>
            <span className="font-serif text-base text-ink">{config.name} 后台</span>
          </div>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<ArrowLeft className="size-4" />}
              onClick={() => navigate('/')}
            >
              返回前台
            </Button>
            <AccountMenu />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6">
        <aside className="hidden w-52 shrink-0 md:block">
          <div className="sticky top-20 flex flex-col gap-4">
            {navList}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              leftIcon={<LogOut className="size-4" />}
              onClick={() => {
                clearRequestCache()
                void logout().then(() => navigate('/'))
              }}
            >
              退出登录
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-[rgb(15_21_22/0.5)]"
            role="presentation"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-64 bg-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-serif text-base text-ink">后台菜单</span>
              <IconButton aria-label="关闭后台导航" onClick={() => setDrawerOpen(false)}>
                <X className="size-4" />
              </IconButton>
            </div>
            {navList}
          </div>
        </div>
      )}
    </div>
  )
}
