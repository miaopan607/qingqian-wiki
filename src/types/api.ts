import type {
  AdminStats,
  AdminUserItem,
  AssetRef,
  AuthUser,
  GalleryDetail,
  GalleryItem,
  KeycapDetail,
  KeycapItem,
  Paginated,
} from './entities'

export type SiteSettings = {
  name: string
  description: string
  registrationOpen: boolean
  storageDriver: 'local' | 's3'
}

export type PublicConfigResponse = {
  name: string
  description: string
  registrationOpen: boolean
}

export type MeResponse = { user: AuthUser | null }
export type AuthResponse = { user: AuthUser }
export type SetupStatusResponse = { initialized: boolean; requiresSetup: boolean }

export type GalleryListResponse = Paginated<GalleryItem>
export type GalleryDetailResponse = { gallery: GalleryDetail }
export type KeycapListResponse = Paginated<KeycapItem> & { nextSeq?: number }
export type KeycapDetailResponse = { keycap: KeycapDetail }

export type LikeResponse = { liked: boolean; likesCount: number }
export type FavoriteResponse = { favorited: boolean; favoritesCount: number }

export type UploadAssetResponse = { asset: AssetRef }
export type AdminStatsResponse = AdminStats
export type AdminUserListResponse = Paginated<AdminUserItem>

export type AdminSettingsResponse = {
  settings: SiteSettings
  capabilities: { s3Configured: boolean; uploadsDir: string; storageDriver: 'local' | 's3' }
}
