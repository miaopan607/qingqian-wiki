import { Bookmark } from 'lucide-react'
import { useEffect, useState } from 'react'

import { GalleryCard } from '../components/gallery/GalleryCard'
import { ApiKeysPanel } from '../components/ApiKeysPanel'
import { AvatarUploader } from '../components/AvatarUploader'
import { Pagination } from '../components/Pagination'
import {
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Masonry,
  Panel,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '../components/ui'
import { useToast } from '../components/Toast'
import { RouteGuard } from '../components/RouteGuard'
import { useAuth } from '../context/AuthContext'
import { useAsyncData } from '../hooks/useAsyncData'
import { usePagination } from '../hooks/usePagination'
import { apiGet } from '../lib/apiClient'
import { updateProfileRequest } from '../lib/auth'
import { getErrorMessage } from '../lib/errorHandler'
import { invalidateCacheByPrefix } from '../lib/requestDedup'
import type { GalleryListResponse } from '../types/api'

const BIO_MAX_LENGTH = 200
const FAVORITE_PAGE_SIZE = 12
const FAVORITE_PAGE_SIZE_OPTIONS = [12, 24, 48]
const SKELETON_HEIGHTS = ['h-[240px]', 'h-[320px]', 'h-[280px]', 'h-[360px]']

function ProfileForm() {
  const { user, refreshAuth } = useAuth()
  const toast = useToast()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDisplayName(user?.displayName ?? '')
    setBio(user?.bio ?? '')
  }, [user?.displayName, user?.bio])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setError(null)

    try {
      await updateProfileRequest({ displayName: displayName.trim(), bio })
      invalidateCacheByPrefix('/api/me')
      await refreshAuth()
      toast.show({ title: '资料已更新', tone: 'success' })
    } catch (err) {
      setError(getErrorMessage(err, '保存失败，请稍后重试'))
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <Panel className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <AvatarUploader />
        <div className="min-w-0">
          <p className="text-base text-ink">{user.displayName}</p>
          <p className="truncate text-sm text-ink-muted">{user.email}</p>
          {user.role !== 'user' && (
            <p className="mt-1 text-xs text-accent">
              {user.role === 'super_admin' ? '超级管理员' : '管理员'}
            </p>
          )}
        </div>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <Field label="昵称" htmlFor="me-display-name" required error={error}>
          <Input
            id="me-display-name"
            maxLength={20}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </Field>

        <Field label="简介" htmlFor="me-bio" hint={`最多 ${BIO_MAX_LENGTH} 个字符`}>
          <Textarea
            id="me-bio"
            maxLength={BIO_MAX_LENGTH}
            rows={3}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="写一句想说的话"
          />
        </Field>

        <div>
          <Button type="submit" loading={saving}>
            保存资料
          </Button>
        </div>
      </form>
    </Panel>
  )
}

function FavoritesList() {
  const pagination = usePagination({
    total: 0,
    defaultPageSize: FAVORITE_PAGE_SIZE,
    pageSizeOptions: FAVORITE_PAGE_SIZE_OPTIONS,
  })

  const list = useAsyncData<GalleryListResponse>(
    (signal) =>
      apiGet<GalleryListResponse>(
        '/api/me/favorites',
        { page: pagination.page, pageSize: pagination.pageSize },
        signal
      ),
    [pagination.page, pagination.pageSize]
  )

  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize))

  if (list.loading) {
    return (
      <Masonry className="[--masonry-columns:1] sm:[--masonry-columns:2] lg:[--masonry-columns:3] gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className={SKELETON_HEIGHTS[index % SKELETON_HEIGHTS.length]} />
        ))}
      </Masonry>
    )
  }

  if (list.error) {
    return (
      <ErrorState message={getErrorMessage(list.error, '收藏加载失败')} onRetry={list.reload} />
    )
  }

  if (items.length === 0) {
    return <EmptyState icon={Bookmark} title="还没有收藏" />
  }

  return (
    <>
      <Masonry className="[--masonry-columns:1] sm:[--masonry-columns:2] lg:[--masonry-columns:3] gap-4">
        {items.map((gallery) => (
          <GalleryCard key={gallery.id} gallery={gallery} />
        ))}
      </Masonry>
      <Pagination
        page={pagination.page}
        totalPages={totalPages}
        onPageChange={pagination.setPage}
        pageSize={pagination.pageSize}
        pageSizeOptions={FAVORITE_PAGE_SIZE_OPTIONS}
        onPageSizeChange={pagination.setPageSize}
      />
    </>
  )
}

export default function Me() {
  return (
    <RouteGuard requireAuth>
      <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-8">
        <PageHeader title="个人中心" />
        <Tabs defaultValue="profile" className="mt-6">
          <TabsList>
            <TabsTrigger value="profile">资料</TabsTrigger>
            <TabsTrigger value="favorites">我的收藏</TabsTrigger>
            <TabsTrigger value="api-keys">API 接入</TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <ProfileForm />
          </TabsContent>
          <TabsContent value="favorites">
            <FavoritesList />
          </TabsContent>
          <TabsContent value="api-keys">
            <ApiKeysPanel />
          </TabsContent>
        </Tabs>
      </div>
    </RouteGuard>
  )
}
