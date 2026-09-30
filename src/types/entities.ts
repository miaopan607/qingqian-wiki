export type AssetRef = {
  id: string
  url: string
  displayUrl: string
  thumbUrl: string
  width: number
  height: number
  blurhash: string | null
}

export type GalleryImageItem = AssetRef & { sortOrder: number }

export type GalleryStatus = 'draft' | 'published'

export type GalleryItem = {
  id: string
  title: string
  description: string
  status: GalleryStatus
  imagesCount: number
  cover: AssetRef | null
  likesCount: number
  favoritesCount: number
  liked: boolean
  favorited: boolean
  authorName: string
  publishedAt: string | null
  createdAt: string
}

export type GalleryDetail = {
  id: string
  title: string
  description: string
  status: GalleryStatus
  images: GalleryImageItem[]
  likesCount: number
  favoritesCount: number
  liked: boolean
  favorited: boolean
  author: { uid: string; displayName: string; avatarUrl: string | null }
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type KeycapItem = {
  id: string
  seq: number
  name: string
  description: string
  imagesCount: number
  cover: AssetRef | null
  createdAt: string
  updatedAt: string
}

export type KeycapDetail = {
  id: string
  seq: number
  name: string
  description: string
  images: GalleryImageItem[]
  createdAt: string
  updatedAt: string
}

export type AuthUser = {
  uid: string
  email: string
  displayName: string
  bio: string
  role: 'user' | 'admin' | 'super_admin'
  status: 'active' | 'banned'
  banReason: string | null
  bannedAt: string | null
  avatarUrl: string | null
}

export type AdminUserItem = AuthUser & {
  createdAt: string
  galleriesCount: number
}

export type AdminStats = {
  galleries: number
  publishedGalleries: number
  keycaps: number
  images: number
  users: number
  bannedUsers: number
  orphanAssets: number
  latestGalleries: GalleryItem[]
  latestKeycaps: KeycapItem[]
}

export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}
