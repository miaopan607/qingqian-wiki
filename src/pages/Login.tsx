import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Button, Field, Input, Panel } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { loginRequest } from '../lib/auth'
import { getErrorMessage } from '../lib/errorHandler'
import { clearRequestCache } from '../lib/requestDedup'

export default function Login() {
  const { config } = useSiteConfig()
  const { refreshAuth } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirect = searchParams.get('redirect') || '/'

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    try {
      await loginRequest(email.trim(), password)
      clearRequestCache()
      await refreshAuth()
      toast.show({ title: '登录成功', tone: 'success' })
      navigate(redirect, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err, '登录失败，请稍后重试'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Panel className="p-7">
        <h1 className="text-center font-serif text-2xl text-ink">登录 {config.name}</h1>
        <p className="mt-2 text-center text-sm text-ink-muted">登录后可点赞、收藏与维护个人资料</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field label="邮箱" htmlFor="login-email" required>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="密码" htmlFor="login-password" required error={error}>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
            />
          </Field>

          <Button type="submit" size="lg" block loading={submitting}>
            登录
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-muted">
          {config.registrationOpen ? (
            <>
              还没有账号？
              <Link to="/register" className="text-accent hover:underline">
                立即注册
              </Link>
            </>
          ) : (
            '当前站点已关闭注册，如需账号请联系管理员。'
          )}
        </p>
        <p className="mt-2 text-center text-xs text-ink-muted">
          忘记密码？请联系管理员在后台重置。
        </p>
      </Panel>
    </div>
  )
}
