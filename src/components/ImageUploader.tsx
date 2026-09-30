import { ArrowDown, ArrowUp, ImagePlus, Star, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'

import { useSiteConfig } from '../hooks/useSiteConfig'
import { apiDelete, apiUpload } from '../lib/apiClient'
import { getErrorMessage } from '../lib/errorHandler'
import { formatFileSize } from '../lib/format'
import type { UploadAssetResponse } from '../types/api'
import type { AssetRef } from '../types/entities'
import { Button, IconButton, Spinner, cn } from './ui'
import { useToast } from './Toast'

const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']
const DEFAULT_MAX_IMAGES = 50

type UploadItem = {
  id: string
  fileName: string
  size: number
  progress: number
  status: 'uploading' | 'done' | 'failed'
  error?: string
}

type ImageUploaderProps = {
  value: AssetRef[]
  onChange: (next: AssetRef[]) => void
  max?: number
  hint?: string
}

// 多图上传：串行上传避免 sharp 并发压满内存，支持排序与设为封面
export function ImageUploader({
  value,
  onChange,
  max = DEFAULT_MAX_IMAGES,
  hint,
}: ImageUploaderProps) {
  const toast = useToast()
  const { config, loading: configLoading } = useSiteConfig()
  const uploadMaxFileSizeMB = config.uploadMaxFileSizeMB
  const inputRef = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)

  const uploadFiles = async (files: File[]) => {
    if (configLoading) return
    const accepted: File[] = []

    for (const file of files) {
      const lowerName = file.name.toLowerCase()
      const hasAllowedExtension = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))

      if (!hasAllowedExtension) {
        toast.show({
          title: `${file.name} 格式不支持`,
          description: `仅支持 ${ACCEPTED_EXTENSIONS.join('、')}`,
          tone: 'error',
        })
        continue
      }
      if (uploadMaxFileSizeMB !== null && file.size > uploadMaxFileSizeMB * 1024 * 1024) {
        toast.show({ title: `${file.name} 超过 ${uploadMaxFileSizeMB}MB`, tone: 'error' })
        continue
      }
      accepted.push(file)
    }

    if (accepted.length === 0) return

    const remaining = max - value.length
    if (remaining <= 0) {
      toast.show({ title: `最多上传 ${max} 张图片`, tone: 'error' })
      return
    }

    const queued = accepted.slice(0, remaining)
    if (queued.length < accepted.length) {
      toast.show({
        title: `本次仅上传前 ${queued.length} 张`,
        description: `已达上限 ${max} 张`,
        tone: 'info',
      })
    }

    const nextAssets = [...value]

    // 串行：单张失败不阻断后续
    for (const file of queued) {
      const itemId = `${file.name}-${Date.now()}-${Math.random()}`
      setItems((current) => [
        ...current,
        { id: itemId, fileName: file.name, size: file.size, progress: 0, status: 'uploading' },
      ])

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await apiUpload<UploadAssetResponse>(
          '/api/admin/uploads/images',
          formData,
          {
            onProgress: (percent) => {
              setItems((current) =>
                current.map((item) => (item.id === itemId ? { ...item, progress: percent } : item))
              )
            },
          }
        )

        nextAssets.push(response.asset)
        onChange([...nextAssets])
        setItems((current) =>
          current.map((item) =>
            item.id === itemId ? { ...item, status: 'done', progress: 100 } : item
          )
        )
      } catch (error) {
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? { ...item, status: 'failed', error: getErrorMessage(error, '上传失败') }
              : item
          )
        )
      }
    }

    // 成功后清理已完成的条目
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.status !== 'done'))
    }, 1500)
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    void uploadFiles(files)
  }

  const moveImage = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= value.length) return

    const next = [...value]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  const setAsCover = (index: number) => {
    if (index === 0) return
    const next = [...value]
    const [moved] = next.splice(index, 1)
    next.unshift(moved)
    onChange(next)
  }

  const removeImage = async (index: number) => {
    const target = value[index]
    const next = value.filter((_, itemIndex) => itemIndex !== index)
    onChange(next)

    // 已保存过的图片由内容接口清理，这里只回滚未保存的新上传
    try {
      const result = await apiDelete<{ success: boolean }>(`/api/admin/uploads/${target.id}`)
      if (!result.success) return
    } catch {
      // 仍被引用时忽略，交给后台「清理未引用图片」
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void uploadFiles(Array.from(event.dataTransfer.files ?? []))
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface-alt/40 px-4 py-8 text-center transition-colors',
          dragging && 'border-accent bg-accent-soft/60'
        )}
      >
        <ImagePlus className="size-6 text-ink-muted" aria-hidden="true" />
        <p className="text-sm text-ink">拖拽图片到此处，或点击选择文件</p>
        <p className="text-xs text-ink-muted">
          支持 {ACCEPTED_EXTENSIONS.join('、')}
          {uploadMaxFileSizeMB !== null && `，单张不超过 ${uploadMaxFileSizeMB}MB`}，最多 {max} 张
        </p>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<Upload className="size-4" />}
          onClick={() => inputRef.current?.click()}
          disabled={configLoading}
        >
          选择图片
        </Button>
        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={handleInputChange}
      />

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-xs"
            >
              {item.status === 'uploading' ? (
                <Spinner />
              ) : item.status === 'failed' ? (
                <span className="text-danger">失败</span>
              ) : (
                <span className="text-accent">完成</span>
              )}
              <span className="min-w-0 flex-1 truncate text-ink">{item.fileName}</span>
              <span className="text-ink-muted">{formatFileSize(item.size)}</span>
              <span className="w-10 text-right tabular-nums text-ink-muted">{item.progress}%</span>
              {item.error && <span className="max-w-40 truncate text-danger">{item.error}</span>}
            </li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {value.map((asset, index) => (
            <li key={asset.id} className="flex flex-col gap-2 rounded-xl border border-border p-2">
              <div className="relative overflow-hidden rounded-lg bg-surface-alt">
                <img
                  src={asset.thumbUrl}
                  alt={`图片 ${index + 1}`}
                  className="aspect-square w-full object-cover"
                />
                {index === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[0.6875rem] text-accent-contrast">
                    封面
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs text-ink-muted">#{index + 1}</span>
                <div className="flex items-center gap-0.5">
                  <IconButton
                    aria-label="上移"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => moveImage(index, -1)}
                  >
                    <ArrowUp className="size-3.5" />
                  </IconButton>
                  <IconButton
                    aria-label="下移"
                    size="sm"
                    disabled={index === value.length - 1}
                    onClick={() => moveImage(index, 1)}
                  >
                    <ArrowDown className="size-3.5" />
                  </IconButton>
                  <IconButton
                    aria-label="设为封面"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => setAsCover(index)}
                  >
                    <Star className="size-3.5" />
                  </IconButton>
                  <IconButton
                    aria-label="删除图片"
                    size="sm"
                    onClick={() => void removeImage(index)}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
