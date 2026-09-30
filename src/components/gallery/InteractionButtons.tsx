import { Bookmark, Heart } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuth } from '../../context/AuthContext'
import { apiPost } from '../../lib/apiClient'
import { getErrorMessage } from '../../lib/errorHandler'
import { invalidateCacheByPrefix } from '../../lib/requestDedup'
import type { FavoriteResponse, LikeResponse } from '../../types/api'
import { Button, cn } from '../ui'
import { useToast } from '../Toast'

type InteractionButtonsProps = {
  galleryId: string
  likesCount: number
  favoritesCount: number
  liked: boolean
  favorited: boolean
  onChange: (next: {
    liked?: boolean
    likesCount?: number
    favorited?: boolean
    favoritesCount?: number
  }) => void
}

// 点赞/收藏：先本地乐观更新，失败回滚并提示
export function InteractionButtons({
  galleryId,
  likesCount,
  favoritesCount,
  liked,
  favorited,
  onChange,
}: InteractionButtonsProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [pending, setPending] = useState<'like' | 'favorite' | null>(null)

  const requireLogin = () => {
    toast.show({ title: '请先登录', description: '登录后即可点赞与收藏', tone: 'info' })
    navigate(`/login?redirect=${encodeURIComponent(`/gallery/${galleryId}`)}`)
  }

  const handleLike = async () => {
    if (!user) {
      requireLogin()
      return
    }
    if (pending) return

    const previous = { liked, likesCount }
    onChange({ liked: !liked, likesCount: likesCount + (liked ? -1 : 1) })
    setPending('like')

    try {
      const result = await apiPost<LikeResponse>(`/api/galleries/${galleryId}/like`)
      onChange({ liked: result.liked, likesCount: result.likesCount })
      invalidateCacheByPrefix('/api/galleries')
    } catch (error) {
      onChange(previous)
      toast.show({ title: '操作失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setPending(null)
    }
  }

  const handleFavorite = async () => {
    if (!user) {
      requireLogin()
      return
    }
    if (pending) return

    const previous = { favorited, favoritesCount }
    onChange({ favorited: !favorited, favoritesCount: favoritesCount + (favorited ? -1 : 1) })
    setPending('favorite')

    try {
      const result = await apiPost<FavoriteResponse>(`/api/galleries/${galleryId}/favorite`)
      onChange({ favorited: result.favorited, favoritesCount: result.favoritesCount })
      invalidateCacheByPrefix('/api/galleries')
      invalidateCacheByPrefix('/api/me/favorites')
      toast.show({
        title: result.favorited ? '已加入收藏' : '已取消收藏',
        tone: 'success',
      })
    } catch (error) {
      onChange(previous)
      toast.show({ title: '操作失败', description: getErrorMessage(error), tone: 'error' })
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleLike}
        loading={pending === 'like'}
        leftIcon={
          <Heart
            className={cn('size-4', liked && 'fill-vermilion text-vermilion')}
            aria-hidden="true"
          />
        }
      >
        {likesCount}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleFavorite}
        loading={pending === 'favorite'}
        leftIcon={
          <Bookmark
            className={cn('size-4', favorited && 'fill-accent text-accent')}
            aria-hidden="true"
          />
        }
      >
        {favoritesCount}
      </Button>
    </div>
  )
}
