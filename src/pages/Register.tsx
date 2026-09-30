import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button, Field, Input, Panel } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { registerRequest } from '../lib/auth'
import { AppError, getErrorMessage } from '../lib/errorHandler'
import { clearRequestCache } from '../lib/requestDedup'

const PASSWORD_MIN_LENGTH = 8

export default function Register() {
  const { config, loading } = useSiteConfig()
  const { refreshAuth } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const validate = (): boolean => {
    const errors: Record<string, string> = {}

    if (!displayName.trim()) errors.displayName = '昵称不能为空'
    else if (displayName.trim().length > 20) errors.displayName = '昵称最多 20 个字符'

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = '邮箱格式无效'

    if (password.length < PASSWORD_MIN_LENGTH)
      errors.password = `密码至少 ${PASSWORD_MIN_LENGTH} 位`
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
      errors.password = '密码需同时包含字母和数字'

    if (password !== confirmPassword) errors.confirmPassword = '两次输入的密码不一致'

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting || !validate()) return

    setSubmitting(true)
    setFieldErrors({})

    try {
      await registerRequest({ email: email.trim(), password, displayName: displayName.trim() })
      clearRequestCache()
      await refreshAuth()
      toast.show({ title: '注册成功，欢迎加入', tone: 'success' })
      navigate('/', { replace: true })
    } catch (error) {
      const message = getErrorMessage(error, '注册失败，请稍后重试')
      if (error instanceof AppError && error.fields) {
        setFieldErrors(error.fields)
      }
      setFieldErrors((current) => ({ ...current, form: message }))
    } finally {
      setSubmitting(false)
    }
  }

  if (!loading && !config.registrationOpen) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16">
        <Panel className="p-7 text-center">
          <h1 className="font-serif text-2xl text-ink">注册已关闭</h1>
          <p className="mt-3 text-sm text-ink-muted">
            当前站点暂不开放注册，如需账号请联系管理员。
          </p>
          <Link to="/" className="mt-6 inline-block text-sm text-accent hover:underline">
            返回首页
          </Link>
        </Panel>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Panel className="p-7">
        <h1 className="text-center font-serif text-2xl text-ink">注册账号</h1>
        <p className="mt-2 text-center text-sm text-ink-muted">注册后即可点赞与收藏美图</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field label="昵称" htmlFor="register-name" required error={fieldErrors.displayName}>
            <Input
              id="register-name"
              required
              maxLength={20}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="展示给其他用户的名称"
            />
          </Field>

          <Field label="邮箱" htmlFor="register-email" required error={fieldErrors.email}>
            <Input
              id="register-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </Field>

          <Field
            label="密码"
            htmlFor="register-password"
            required
            error={fieldErrors.password}
            hint="至少 8 位，需包含字母和数字"
          >
            <Input
              id="register-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Field
            label="确认密码"
            htmlFor="register-confirm"
            required
            error={fieldErrors.confirmPassword}
          >
            <Input
              id="register-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </Field>

          {fieldErrors.form && <p className="text-sm text-danger">{fieldErrors.form}</p>}

          <Button type="submit" size="lg" block loading={submitting}>
            注册
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-ink-muted">
          已有账号？
          <Link to="/login" className="text-accent hover:underline">
            去登录
          </Link>
        </p>
      </Panel>
    </div>
  )
}
