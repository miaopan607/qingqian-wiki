import { ArrowLeft, Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { ImageUploader } from '../../components/ImageUploader'
import {
  Button,
  CharacterCount,
  Field,
  Input,
  PageHeader,
  Panel,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import { apiDelete, apiGet, apiPatch, apiPost, apiRequest } from '../../lib/apiClient'
import { AppError, getErrorMessage } from '../../lib/errorHandler'
import { invalidateCacheByPrefix } from '../../lib/requestDedup'
import type { GalleryDetailResponse } from '../../types/api'
import type { AssetRef } from '../../types/entities'

const TITLE_MAX = 60
const DESCRIPTION_MAX = 2000

// 未保存就离开时提醒（浏览器级）
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])
}

export default function AdminGalleryEdit() {
  const { galleryId } = useParams()
  const isEdit = Boolean(galleryId)
  const navigate = useNavigate()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('published')
  const [assets, setAssets] = useState<AssetRef[]>([])
  const [initialAssetIds, setInitialAssetIds] = useState<string[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!galleryId) return

    let active = true
    apiRequest<GalleryDetailResponse>(`/api/admin/galleries/${galleryId}`, { dedup: false })
      .then((data) => {
        if (!active) return
        setTitle(data.gallery.title)
        setDescription(data.gallery.description)
        setStatus(data.gallery.status)
        setAssets(data.gallery.images.map((image) => ({ ...image })))
        setInitialAssetIds(data.gallery.images.map((image) => image.id))
      })
      .catch((error) => {
        toast.show({ title: '加载失败', description: getErrorMessage(error), tone: 'error' })
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId])

  useUnsavedGuard(dirty)

  const markDirty = useCallback(() => setDirty(true), [])

  // 本次新上传但未保存的资产：取消时逐个回滚，避免产生孤儿文件
  const unsavedAssetIds = useMemo(
    () => assets.filter((asset) => !initialAssetIds.includes(asset.id)).map((asset) => asset.id),
    [assets, initialAssetIds]
  )

  const rollbackUnsaved = useCallback(async () => {
    if (unsavedAssetIds.length === 0) return
    await Promise.allSettled(
      unsavedAssetIds.map((assetId) =>
        apiDelete<{ success: boolean }>(`/api/admin/uploads/${assetId}`)
      )
    )
  }, [unsavedAssetIds])

  const handleCancel = async () => {
    if (dirty && !window.confirm('有未保存的修改，确定离开吗？')) return
    await rollbackUnsaved()
    navigate('/admin/galleries')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return

    if (!title.trim()) {
      setFieldErrors({ title: '标题不能为空' })
      return
    }
    if (assets.length === 0) {
      setFieldErrors({ assetIds: '至少上传一张图片' })
      return
    }

    setSaving(true)
    setFieldErrors({})

    try {
      const payload = {
        title: title.trim(),
        description,
        status,
        assetIds: assets.map((asset) => asset.id),
      }

      if (isEdit && galleryId) {
        await apiPatch(`/api/admin/galleries/${galleryId}`, payload)
      } else {
        await apiPost('/api/admin/galleries', payload)
      }

      invalidateCacheByPrefix('/api/galleries')
      invalidateCacheByPrefix('/api/admin/galleries')
      setDirty(false)
      toast.show({ title: isEdit ? '图集已更新' : '图集已创建', tone: 'success' })
      navigate('/admin/galleries')
    } catch (error) {
      if (error instanceof AppError && error.fields) setFieldErrors(error.fields)
      toast.show({ title: '保存失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/admin/galleries"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        返回美图管理
      </Link>

      <PageHeader title={isEdit ? '编辑图集' : '新建图集'} />

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Panel className="flex flex-col gap-4">
          <Field label="标题" htmlFor="gallery-title" required error={fieldErrors.title}>
            <Input
              id="gallery-title"
              maxLength={TITLE_MAX}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value)
                markDirty()
              }}
              placeholder="例如：清浅写真 / 键帽实拍"
            />
          </Field>

          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">描述</span>
            <CharacterCount value={description} max={DESCRIPTION_MAX} />
          </div>
          <Textarea
            aria-label="描述"
            maxLength={DESCRIPTION_MAX}
            rows={4}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              markDirty()
            }}
            placeholder="可写拍摄时间、地点或内容说明"
          />

          <Field label="状态" htmlFor="gallery-status">
            <Select
              id="gallery-status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as 'draft' | 'published')
                markDirty()
              }}
            >
              <option value="published">已发布（前台可见）</option>
              <option value="draft">草稿（仅管理员可见）</option>
            </Select>
          </Field>
        </Panel>

        <Panel className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base text-ink">图片</h2>
            <span className="text-xs text-ink-muted">已选 {assets.length} 张</span>
          </div>
          <ImageUploader
            value={assets}
            onChange={(next) => {
              setAssets(next)
              markDirty()
            }}
          />
          {fieldErrors.assetIds && <p className="text-xs text-danger">{fieldErrors.assetIds}</p>}
        </Panel>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={saving} leftIcon={<Save className="size-4" />}>
            保存
          </Button>
          <Button type="button" variant="ghost" onClick={handleCancel} disabled={saving}>
            取消
          </Button>
        </div>
      </form>
    </div>
  )
}
