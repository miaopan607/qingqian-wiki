import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, Field, Input, Panel } from '../components/ui'
import { useToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { apiPost } from '../lib/apiClient'
import { AppError, getErrorMessage } from '../lib/errorHandler'
import { clearRequestCache } from '../lib/requestDedup'
import type { AuthResponse } from '../types/api'

const PASSWORD_MIN_LENGTH = 8

// 空库首次部署：创建超级管理员并直接登录
export default function Setup() {
  const { refreshAuth } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setFieldErrors({})

    try {
      await apiPost<AuthResponse>('/api/setup/initialize', {
        email: email.trim(),
        displayName: displayName.trim(),
        password,
      })
      clearRequestCache()
      await refreshAuth()
      toast.show({ title: '初始化完成，已使用管理员账号登录', tone: 'success' })
      navigate('/', { replace: true })
    } catch (error) {
      const message = getErrorMessage(error, '初始化失败，请稍后重试')
      if (error instanceof AppError && error.fields) setFieldErrors(error.fields)
      setFieldErrors((current) => ({ ...current, form: message }))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <Panel className="p-7">
        <h1 className="font-serif text-2xl text-ink">初始化站点</h1>
        <p className="mt-2 text-sm text-ink-muted">
          当前数据库还没有任何账号。创建第一个账号后，它将成为超级管理员，可进入后台管理内容与用户。
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <Field label="管理员昵称" htmlFor="setup-name" required error={fieldErrors.displayName}>
            <Input
              id="setup-name"
              required
              maxLength={20}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="如：清浅"
            />
          </Field>

          <Field label="邮箱" htmlFor="setup-email" required error={fieldErrors.email}>
            <Input
              id="setup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
            />
          </Field>

          <Field
            label="密码"
            htmlFor="setup-password"
            required
            error={fieldErrors.password}
            hint={`至少 ${PASSWORD_MIN_LENGTH} 位，需包含字母和数字`}
          >
            <Input
              id="setup-password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {fieldErrors.form && <p className="text-sm text-danger">{fieldErrors.form}</p>}

          <Button type="submit" size="lg" block loading={submitting}>
            创建管理员并进入站点
          </Button>
        </form>
      </Panel>
    </div>
  )
}
