import { ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../context/AuthContext'
import { EmptyState, LinkButton, Panel, Spinner } from './ui'

type RouteGuardProps = {
  children: ReactNode
  requireAuth?: boolean
  requireAdmin?: boolean
  requireSuperAdmin?: boolean
}

// 路由级权限：未登录跳登录页并带回来路，权限不足就地提示
export function RouteGuard({
  children,
  requireAuth,
  requireAdmin,
  requireSuperAdmin,
}: RouteGuardProps) {
  const { user, loading, isAdmin, isSuperAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner label="正在校验登录状态" />
      </div>
    )
  }

  if ((requireAuth || requireAdmin || requireSuperAdmin) && !user) {
    const redirect = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  const missingAdmin = requireAdmin && !isAdmin
  const missingSuperAdmin = requireSuperAdmin && !isSuperAdmin

  if (missingAdmin || missingSuperAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16">
        <Panel>
          <EmptyState
            icon={ShieldAlert}
            title="没有访问权限"
            description={
              missingSuperAdmin
                ? '该功能仅超级管理员可用。'
                : '该功能需要管理员权限，请联系管理员开通。'
            }
            action={<LinkButton to="/">返回首页</LinkButton>}
          />
        </Panel>
      </div>
    )
  }

  return <>{children}</>
}
