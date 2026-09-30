import { Camera, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import ReactCrop, { centerCrop, makeAspectCrop, type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'

import { useAuth } from '../context/AuthContext'
import { removeAvatarRequest, uploadAvatarRequest } from '../lib/auth'
import { getErrorMessage } from '../lib/errorHandler'
import { invalidateCacheByPrefix } from '../lib/requestDedup'
import { AlertDialog, Avatar, Button, Dialog, DialogContent, IconButton } from './ui'
import { useToast } from './Toast'

const OUTPUT_SIZE = 512

// 头像：本地裁剪成方形后再上传，服务端按 512x512 覆盖裁切兜底
export function AvatarUploader() {
  const { user, refreshAuth } = useAuth()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)

  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [crop, setCrop] = useState<Crop>()
  const [uploading, setUploading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => setSourceImage(String(reader.result))
    reader.readAsDataURL(file)
  }

  const handleConfirmCrop = async () => {
    if (!sourceImage || !crop?.width || !crop.height) {
      setSourceImage(null)
      return
    }

    setUploading(true)
    try {
      const image = new Image()
      image.src = sourceImage
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE

      const context = canvas.getContext('2d')
      if (!context) throw new Error('当前浏览器不支持图片裁剪')

      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      )

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.9)
      )
      if (!blob) throw new Error('裁剪结果生成失败')

      await uploadAvatarRequest(blob)
      invalidateCacheByPrefix('/api/me')
      await refreshAuth()
      toast.show({ title: '头像已更新', tone: 'success' })
      setSourceImage(null)
      setCrop(undefined)
    } catch (error) {
      toast.show({ title: '头像上传失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const handleRemove = async () => {
    try {
      await removeAvatarRequest()
      invalidateCacheByPrefix('/api/me')
      await refreshAuth()
      toast.show({ title: '头像已移除', tone: 'success' })
    } catch (error) {
      toast.show({ title: '操作失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setConfirmRemove(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Avatar name={user?.displayName ?? '清'} src={user?.avatarUrl} size="lg" />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={uploading}
            leftIcon={<Camera className="size-4" />}
            onClick={() => inputRef.current?.click()}
          >
            更换头像
          </Button>
          {user?.avatarUrl && (
            <IconButton aria-label="移除头像" size="sm" onClick={() => setConfirmRemove(true)}>
              <Trash2 className="size-4" />
            </IconButton>
          )}
        </div>
        <p className="text-xs text-ink-muted">
          支持 JPG/PNG/WEBP，上传前可裁剪，建议使用方形图片。
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog open={Boolean(sourceImage)} onOpenChange={(open) => !open && setSourceImage(null)}>
        <DialogContent
          title="裁剪头像"
          description="拖动选择方形区域，保存后生成 512×512 头像。"
          footer={
            <>
              <Button variant="ghost" onClick={() => setSourceImage(null)} disabled={uploading}>
                取消
              </Button>
              <Button loading={uploading} onClick={handleConfirmCrop}>
                保存头像
              </Button>
            </>
          }
        >
          {sourceImage && (
            <div className="flex justify-center">
              <ReactCrop
                crop={crop}
                aspect={1}
                circularCrop
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(completeCrop) => setCrop(completeCrop)}
              >
                <img
                  src={sourceImage}
                  alt="待裁剪头像"
                  className="max-h-80"
                  onLoad={(event) => {
                    const { width, height } = event.currentTarget
                    setCrop(
                      centerCrop(
                        makeAspectCrop({ unit: '%', width: 80 }, 1, width, height),
                        width,
                        height
                      )
                    )
                  }}
                />
              </ReactCrop>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="移除头像？"
        description="移除后将显示昵称首字占位，可随时重新上传。"
        confirmText="移除"
        tone="danger"
        onConfirm={handleRemove}
      />
    </div>
  )
}
