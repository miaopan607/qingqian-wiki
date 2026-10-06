import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { cn } from './ui/utils'
import { AccountMenu } from './AccountMenu'
import { ThemeToggle } from './ThemeToggle'
import { Button, IconButton, LinkButton } from './ui'

const NAV_ITEMS = [
  { to: '/gallery', label: '美图' },
  { to: '/keycaps', label: '键帽' },
  { to: '/check-in', label: '签到' },
]

export function Navbar() {
  const { config } = useSiteConfig()
  const { user } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" className="flex items-center gap-2 text-ink">
          <span className="font-serif text-lg tracking-[0.18em]">{config.name}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                  isActive ? 'bg-accent-soft text-accent' : 'text-ink-muted hover:text-ink'
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <AccountMenu />
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <LinkButton to="/login" variant="ghost" size="sm">
                登录
              </LinkButton>
              {config.registrationOpen && (
                <LinkButton to="/register" size="sm">
                  注册
                </LinkButton>
              )}
            </div>
          )}
          <IconButton
            aria-label={menuOpen ? '关闭菜单' : '打开菜单'}
            className="md:hidden"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </IconButton>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-border bg-surface px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1" aria-label="移动端导航">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3 py-2 text-sm',
                    isActive ? 'bg-accent-soft text-accent' : 'text-ink-muted'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            {!user && (
              <div className="mt-2 flex gap-2">
                <LinkButton to="/login" variant="outline" size="sm" block>
                  登录
                </LinkButton>
                {config.registrationOpen && (
                  <LinkButton to="/register" size="sm" block>
                    注册
                  </LinkButton>
                )}
              </div>
            )}
            {user && (
              <Button variant="ghost" size="sm" className="mt-2 justify-start" asChild>
                <Link to="/me">个人中心</Link>
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}
