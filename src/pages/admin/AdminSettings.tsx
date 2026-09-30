import { Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  AlertDialog,
  Button,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  Switch,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import { invalidateSiteConfig } from '../../hooks/useSiteConfig'
import { useAsyncData } from '../../hooks/useAsyncData'
import { apiPatch, apiPost, apiRequest } from '../../lib/apiClient'
import { AppError, getErrorMessage } from '../../lib/errorHandler'
import type { AdminStatsResponse, AdminSettingsResponse } from '../../types/api'

export default function AdminSettings() {
  const toast = useToast()
  const settings = useAsyncData<AdminSettingsResponse>(() =>
    apiRequest<AdminSettingsResponse>('/api/admin/settings', { dedup: false })
  )
  const stats = useAsyncData<AdminStatsResponse>((signal) =>
    apiRequest<AdminStatsResponse>('/api/admin/stats', { dedup: false, signal })
  )

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [storageDriver, setStorageDriver] = useState<'local' | 's3'>('local')
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [purging, setPurging] = useState(false)

  useEffect(() => {
    if (!settings.data) return
    setName(settings.data.settings.name)
    setDescription(settings.data.settings.description)
    setRegistrationOpen(settings.data.settings.registrationOpen)
    setStorageDriver(settings.data.settings.storageDriver)
  }, [settings.data])

  const s3Configured = settings.data?.capabilities.s3Configured ?? false

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setFieldErrors({})

    try {
      await apiPatch<AdminSettingsResponse>('/api/admin/settings', {
        name: name.trim(),
        description: description.trim(),
        registrationOpen,
        storageDriver,
      })
      invalidateSiteConfig()
      toast.show({ title: '站点设置已保存', tone: 'success' })
      settings.reload()
    } catch (error) {
      if (error instanceof AppError && error.fields) setFieldErrors(error.fields)
      toast.show({ title: '保存失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const handlePurge = async () => {
    setPurging(true)
    try {
      const result = await apiPost<{ deleted: number }>(
        '/api/admin/maintenance/purge-orphan-assets'
      )
      toast.show({
        title: result.deleted > 0 ? `已清理 ${result.deleted} 个未引用文件` : '没有需要清理的文件',
        tone: 'success',
      })
      stats.reload()
    } catch (error) {
      toast.show({ title: '清理失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setPurging(false)
      setConfirmPurge(false)
    }
  }

  if (settings.loading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="站点设置" subtitle="站点信息、注册开关与图片存储（仅超级管理员）" />

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Panel className="flex flex-col gap-4">
          <h2 className="text-base text-ink">基础信息</h2>
          <Field label="站点名称" htmlFor="site-name" required error={fieldErrors.name}>
            <Input
              id="site-name"
              maxLength={30}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field
            label="站点简介"
            htmlFor="site-description"
            error={fieldErrors.description}
            hint="展示在首页与页脚，最多 100 字"
          >
            <Input
              id="site-description"
              maxLength={100}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
            <div>
              <p className="text-sm text-ink">开放注册</p>
              <p className="text-xs text-ink-muted">关闭后仅管理员可创建账号</p>
            </div>
            <Switch
              checked={registrationOpen}
              onCheckedChange={setRegistrationOpen}
              aria-label="开放注册"
            />
          </div>
        </Panel>

        <Panel className="flex flex-col gap-4">
          <h2 className="text-base text-ink">图片存储</h2>
          <Field
            label="存储驱动"
            htmlFor="storage-driver"
            hint={
              s3Configured
                ? '切换后仅影响新上传的图片，历史图片仍按上传时的方式访问。'
                : '需先在 .env 配置 S3_BUCKET 与 S3_PUBLIC_BASE_URL 才能切换到对象存储。'
            }
          >
            <Select
              id="storage-driver"
              value={storageDriver}
              onChange={(event) => setStorageDriver(event.target.value as 'local' | 's3')}
            >
              <option value="local">服务器本地磁盘</option>
              <option value="s3" disabled={!s3Configured}>
                S3 兼容对象存储{s3Configured ? '' : '（未配置）'}
              </option>
            </Select>
          </Field>
          <p className="text-xs text-ink-muted">
            本地上传目录：{settings.data?.capabilities.uploadsDir}
          </p>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3">
            <div>
              <p className="text-sm text-ink">清理未引用图片</p>
              <p className="text-xs text-ink-muted">
                当前有 {stats.data?.orphanAssets ?? 0} 个未被任何内容引用的图片文件
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Trash2 className="size-4" />}
              onClick={() => setConfirmPurge(true)}
            >
              立即清理
            </Button>
          </div>
        </Panel>

        <div>
          <Button type="submit" loading={saving} leftIcon={<Save className="size-4" />}>
            保存设置
          </Button>
        </div>
      </form>

      <AlertDialog
        open={confirmPurge}
        onOpenChange={setConfirmPurge}
        title="清理未引用图片？"
        description="将删除上传后未被任何图集或键帽引用、且超过 1 小时的图片文件，操作不可撤销。"
        confirmText="确认清理"
        tone="danger"
        loading={purging}
        onConfirm={handlePurge}
      />
    </div>
  )
}
