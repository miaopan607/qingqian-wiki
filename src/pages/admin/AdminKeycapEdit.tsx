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
  Skeleton,
  Textarea,
} from '../../components/ui'
import { useToast } from '../../components/Toast'
import { apiDelete, apiGet, apiPatch, apiPost, apiRequest } from '../../lib/apiClient'
import { AppError, getErrorMessage } from '../../lib/errorHandler'
import { invalidateCacheByPrefix } from '../../lib/requestDedup'
import type { KeycapDetailResponse, KeycapListResponse } from '../../types/api'
import type { AssetRef } from '../../types/entities'

const NAME_MAX = 60
const DESCRIPTION_MAX = 2000

export default function AdminKeycapEdit() {
  const { keycapId } = useParams()
  const isEdit = Boolean(keycapId)
  const navigate = useNavigate()
  const toast = useToast()

  const [seq, setSeq] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [assets, setAssets] = useState<AssetRef[]>([])
  const [initialAssetIds, setInitialAssetIds] = useState<string[]>([])
  const [nextSeq, setNextSeq] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        if (keycapId) {
          const data = await apiRequest<KeycapDetailResponse>(`/api/admin/keycaps/${keycapId}`, {
            dedup: false,
          })
          if (!active) return
          setSeq(String(data.keycap.seq))
          setName(data.keycap.name)
          setDescription(data.keycap.description)
          setAssets(data.keycap.images.map((image) => ({ ...image })))
          setInitialAssetIds(data.keycap.images.map((image) => image.id))
        } else {
          const data = await apiGet<KeycapListResponse>('/api/admin/keycaps', {
            page: 1,
            pageSize: 10,
          })
          if (!active) return
          setNextSeq(data.nextSeq ?? 1)
          setSeq(String(data.nextSeq ?? 1))
        }
      } catch (error) {
        toast.show({ title: '加载失败', description: getErrorMessage(error), tone: 'error' })
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keycapId])

  useEffect(() => {
    if (!dirty) return

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const markDirty = useCallback(() => setDirty(true), [])

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
    navigate('/admin/keycaps')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return

    const errors: Record<string, string> = {}
    const parsedSeq = Number(seq)

    if (!Number.isInteger(parsedSeq) || parsedSeq < 1 || parsedSeq > 9999) {
      errors.seq = '序号需为 1-9999 的整数'
    }
    if (!name.trim()) errors.name = '名称不能为空'
    if (assets.length === 0) errors.assetIds = '至少上传一张图片'

    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)

    try {
      const payload = {
        seq: parsedSeq,
        name: name.trim(),
        description,
        assetIds: assets.map((asset) => asset.id),
      }

      if (isEdit && keycapId) {
        await apiPatch(`/api/admin/keycaps/${keycapId}`, payload)
      } else {
        await apiPost('/api/admin/keycaps', payload)
      }

      invalidateCacheByPrefix('/api/keycaps')
      invalidateCacheByPrefix('/api/admin/keycaps')
      setDirty(false)
      toast.show({ title: isEdit ? '键帽已更新' : '键帽已创建', tone: 'success' })
      navigate('/admin/keycaps')
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
        to="/admin/keycaps"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        返回键帽管理
      </Link>

      <PageHeader title={isEdit ? '编辑键帽' : '新建键帽'} />

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Panel className="flex flex-col gap-4">
          <Field
            label="序号"
            htmlFor="keycap-seq"
            required
            error={fieldErrors.seq}
            hint={!isEdit && nextSeq ? `建议使用下一个序号：${nextSeq}` : undefined}
          >
            <Input
              id="keycap-seq"
              type="number"
              min={1}
              max={9999}
              value={seq}
              onChange={(event) => {
                setSeq(event.target.value)
                markDirty()
              }}
            />
          </Field>

          <Field label="名称" htmlFor="keycap-name" required error={fieldErrors.name}>
            <Input
              id="keycap-name"
              maxLength={NAME_MAX}
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                markDirty()
              }}
              placeholder="例如：山海"
            />
          </Field>

          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-muted">描述</span>
            <CharacterCount value={description} max={DESCRIPTION_MAX} />
          </div>
          <Textarea
            aria-label="描述"
            maxLength={DESCRIPTION_MAX}
            rows={5}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              markDirty()
            }}
            placeholder="记录开团信息、配色与工艺说明"
          />
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
