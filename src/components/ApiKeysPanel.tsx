import { KeyRound } from 'lucide-react'
import { useRef, useState } from 'react'

import { useToast } from './Toast'
import {
  AlertDialog,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Panel,
  Select,
  Skeleton,
} from './ui'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiDelete, apiGet, apiPost } from '../lib/apiClient'
import { getErrorMessage } from '../lib/errorHandler'
import { formatDateTime } from '../lib/format'
import { invalidateCacheByPrefix } from '../lib/requestDedup'
import type {
  ApiKeyListResponse,
  ApiKeyMetadata,
  CreateApiKeyInput,
  CreateApiKeyResponse,
} from '../types/api'

const API_KEYS_PATH = '/api/me/api-keys'

function statusLabel(status: ApiKeyMetadata['status']): string {
  if (status === 'expired') return '已过期'
  if (status === 'revoked') return '已撤销'
  if (status === 'invalidated') return '密码已更改'
  return '可用'
}

function statusTone(status: ApiKeyMetadata['status']): 'accent' | 'danger' | 'muted' {
  if (status === 'active') return 'accent'
  if (status === 'revoked' || status === 'invalidated') return 'danger'
  return 'muted'
}

export function ApiKeysPanel() {
  const toast = useToast()
  const tokenInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [scope, setScope] = useState<CreateApiKeyInput['scope']>('read')
  const [expiration, setExpiration] = useState<'30' | '90' | '365' | 'never'>('90')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [secret, setSecret] = useState<{ token: string; apiKeyId: string } | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyMetadata | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const keys = useAsyncData<ApiKeyListResponse>(
    (signal) => apiGet<ApiKeyListResponse>(API_KEYS_PATH, undefined, signal),
    []
  )

  const activeCount = keys.data?.items.filter((key) => key.status === 'active').length ?? 0

  const createKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (creating || secret || !name.trim()) return

    setCreating(true)
    setCreateError(null)
    try {
      const input: CreateApiKeyInput = {
        name: name.trim(),
        scope,
        expiresInDays: expiration === 'never' ? null : (Number(expiration) as 30 | 90 | 365),
      }
      const result = await apiPost<CreateApiKeyResponse>(API_KEYS_PATH, input)
      setSecret({ token: result.token, apiKeyId: result.apiKey.id })
      setName('')
      invalidateCacheByPrefix(API_KEYS_PATH)
      keys.reload()
    } catch (error) {
      setCreateError(getErrorMessage(error, '创建密钥失败，请稍后重试'))
    } finally {
      setCreating(false)
    }
  }

  const copySecret = async () => {
    if (!secret) return
    setCopyFailed(false)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(secret.token)
      toast.show({ title: '密钥已复制', tone: 'success' })
    } catch {
      setCopyFailed(true)
      tokenInputRef.current?.focus()
      tokenInputRef.current?.select()
    }
  }

  const closeSecret = () => {
    setSecret(null)
    setCopyFailed(false)
  }

  const revokeKey = async () => {
    if (!pendingRevoke || revokingId) return
    const key = pendingRevoke
    setRevokingId(key.id)
    setRevokeError(null)
    try {
      await apiDelete<{ success: boolean }>(`${API_KEYS_PATH}/${encodeURIComponent(key.id)}`)
      if (secret?.apiKeyId === key.id) closeSecret()
      setPendingRevoke(null)
      toast.show({ title: 'API 密钥已撤销', tone: 'success' })
      invalidateCacheByPrefix(API_KEYS_PATH)
      keys.reload()
    } catch (error) {
      setRevokeError(getErrorMessage(error, '撤销失败，请稍后重试'))
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel className="flex flex-col gap-5">
        <div>
          <h2 className="text-lg text-ink">个人 API 密钥</h2>
          <p className="mt-1 text-sm text-ink-muted">
            为脚本或服务创建独立凭证。每个账户最多保留 10 把有效密钥。
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface-alt p-4 text-sm text-ink-muted">
          密钥通过 Bearer
          请求头认证。密码重置会使所有旧密钥失效；账号封禁期间无法调用。永久密钥在泄露后必须手动撤销。
        </div>

        {secret && (
          <section
            aria-labelledby="api-key-once-title"
            className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent-soft p-4"
          >
            <div>
              <h3 id="api-key-once-title" className="font-medium text-ink">
                仅显示一次，请立即保存
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                离开此标签或关闭后，本站不会再次显示完整密钥。
              </p>
            </div>
            <Input
              ref={tokenInputRef}
              aria-label="新 API 密钥"
              autoComplete="off"
              readOnly
              value={secret.token}
              onFocus={(event) => event.currentTarget.select()}
            />
            {copyFailed && (
              <p role="alert" className="text-sm text-danger">
                无法访问剪贴板，密钥已选中，请手动复制。
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={copySecret}>
                复制密钥
              </Button>
              <Button type="button" onClick={closeSecret}>
                我已保存，关闭
              </Button>
            </div>
          </section>
        )}

        <form className="grid gap-4 sm:grid-cols-2" onSubmit={createKey}>
          <Field label="密钥名称" htmlFor="api-key-name" required>
            <Input
              id="api-key-name"
              autoComplete="off"
              maxLength={50}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：个人备份脚本"
              disabled={Boolean(secret)}
            />
          </Field>
          <Field label="权限" htmlFor="api-key-scope">
            <Select
              id="api-key-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value as CreateApiKeyInput['scope'])}
              disabled={Boolean(secret)}
            >
              <option value="read">只读</option>
              <option value="read_write">读写</option>
            </Select>
            <p className="text-xs text-ink-muted">
              写入操作仅管理员可用，读写密钥不会提升账户权限。
            </p>
          </Field>
          <Field label="有效期" htmlFor="api-key-expiration">
            <Select
              id="api-key-expiration"
              value={expiration}
              onChange={(event) => setExpiration(event.target.value as typeof expiration)}
              disabled={Boolean(secret)}
            >
              <option value="30">30 天</option>
              <option value="90">90 天（默认）</option>
              <option value="365">365 天</option>
              <option value="never">永久</option>
            </Select>
            {expiration === 'never' && (
              <p className="text-xs text-danger">永久密钥不会自动失效，泄露后须手动撤销。</p>
            )}
          </Field>
          <div className="flex items-end">
            <Button
              type="submit"
              loading={creating}
              disabled={Boolean(secret) || activeCount >= 10 || !name.trim()}
            >
              创建密钥
            </Button>
          </div>
          {createError && (
            <p role="alert" className="text-sm text-danger sm:col-span-2">
              {createError}
            </p>
          )}
          {activeCount >= 10 && !secret && (
            <p className="text-sm text-ink-muted sm:col-span-2">
              已达到有效密钥上限。撤销或等待现有密钥过期后即可创建。
            </p>
          )}
        </form>
      </Panel>

      <Panel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg text-ink">已创建的密钥</h2>
            <p className="mt-1 text-sm text-ink-muted">
              仅显示前缀用于识别；列表不会返回完整密钥。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={keys.reload}>
            刷新列表
          </Button>
        </div>

        {keys.loading && !keys.data ? (
          <div className="flex flex-col gap-3" aria-label="正在加载 API 密钥">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : keys.error ? (
          <ErrorState
            message={getErrorMessage(keys.error, '密钥列表加载失败')}
            onRetry={keys.reload}
          />
        ) : keys.data?.items.length ? (
          <ul className="flex flex-col gap-3">
            {keys.data.items.map((key) => (
              <li
                key={key.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-ink">{key.name}</h3>
                    <Badge tone={statusTone(key.status)}>{statusLabel(key.status)}</Badge>
                    <Badge tone="muted">{key.scope === 'read' ? '只读' : '读写'}</Badge>
                  </div>
                  <p className="mt-1 break-all font-mono text-xs text-ink-muted">
                    {key.tokenPrefix}…
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    创建于 {formatDateTime(key.createdAt)} · 到期于{' '}
                    {key.expiresAt ? formatDateTime(key.expiresAt) : '永久'}
                  </p>
                </div>
                {key.status === 'active' && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={Boolean(revokingId)}
                    onClick={() => {
                      setRevokeError(null)
                      setPendingRevoke(key)
                    }}
                  >
                    撤销
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={KeyRound}
            title="尚无 API 密钥"
            description="创建后即可使用受限的 Bearer API 接口。"
          />
        )}
        {revokeError && (
          <p role="alert" className="text-sm text-danger">
            {revokeError}
          </p>
        )}
      </Panel>

      <Panel className="flex flex-col gap-3">
        <h2 className="text-lg text-ink">快速接入</h2>
        <p className="text-sm text-ink-muted">
          请求时添加{' '}
          <code className="rounded bg-surface-alt px-1.5 py-0.5">
            Authorization: Bearer &lt;密钥&gt;
          </code>
          ；脚本无需 Cookie 或 CSRF 头。
        </p>
        <pre className="overflow-x-auto rounded-xl bg-surface-alt p-4 text-xs text-ink">
          <code>{`curl -H "Authorization: Bearer $TOKEN" "$BASE/api/galleries?page=1&pageSize=24"`}</code>
        </pre>
        <ul className="list-inside list-disc space-y-1 text-sm text-ink-muted">
          <li>只读接口：公开图集与键帽列表/详情；管理员还可读取后台图集草稿。</li>
          <li>管理员读写接口：上传图片、创建/修改图集、回滚未引用的上传图片。</li>
          <li>图片上传使用 multipart 字段 file；普通账户的读写密钥仍不能执行管理写入。</li>
        </ul>
        <p className="text-sm text-ink-muted">
          完整字段、权限、错误码与图集发布流程：
          <a
            href="/api.md"
            target="_blank"
            rel="noreferrer"
            className="text-accent underline underline-offset-4"
          >
            查看 API 接入文档（Markdown）
          </a>
          。
        </p>
      </Panel>

      <AlertDialog
        open={Boolean(pendingRevoke)}
        onOpenChange={(open) => {
          if (!open && !revokingId) setPendingRevoke(null)
        }}
        title="撤销 API 密钥？"
        description={
          pendingRevoke ? `撤销“${pendingRevoke.name}”后，使用它的请求将立即失效。` : undefined
        }
        confirmText="确认撤销"
        cancelText="保留密钥"
        tone="danger"
        loading={Boolean(revokingId)}
        onConfirm={revokeKey}
      />
    </div>
  )
}
