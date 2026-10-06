import type {
  AdminCheckInParticipant,
  CheckInProgress,
  CheckInRecord,
  CheckInRankingItem,
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
  registrationOpen: boolean
  storageDriver: 'local' | 's3'
}

export type PublicConfigResponse = {
  name: string
  registrationOpen: boolean
  uploadMaxFileSizeMB: number | null
}

export type MeResponse = { user: AuthUser | null }
export type AuthResponse = { user: AuthUser }
export type SetupStatusResponse = { initialized: boolean; requiresSetup: boolean }

export type GalleryListResponse = Paginated<GalleryItem> & { nextSeq?: number }
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

export type ApiKeyMetadata = {
  id: string
  name: string
  tokenPrefix: string
  scope: 'read' | 'read_write'
  createdAt: string
  expiresAt: string | null
  revokedAt: string | null
  status: 'active' | 'expired' | 'revoked' | 'invalidated'
}

export type ApiKeyListResponse = { items: ApiKeyMetadata[] }
export type CreateApiKeyResponse = { apiKey: ApiKeyMetadata; token: string }
export type CreateApiKeyInput = {
  name: string
  scope: 'read' | 'read_write'
  expiresInDays: 30 | 90 | 365 | null
}

export type CheckInStatusResponse = {
  event: {
    id: string
    debug: boolean
    startsAt: string
    endsAt: string
    days: 30
    rewardLabel: string
  }
  serverNow: string
  phase: 'upcoming' | 'active' | 'ended'
  dayIndex: number | null
  nextTransitionAt: string | null
  turnstileSiteKey: string | null
  me: CheckInProgress | null
}
export type SubmitCheckInInput = { turnstileToken: string; dayIndex: number }
export type SubmitCheckInResponse = { record: CheckInRecord }
export type UpdateCheckInProfileInput = { wechat: string | null }
export type UpdateCheckInProfileResponse = { wechat: string | null }
export type CheckInRankingResponse = Paginated<CheckInRankingItem> & {
  qualifiedTotal: number
}
export type AdminCheckInResponse = Paginated<AdminCheckInParticipant> & {
  event: CheckInStatusResponse['event']
  snapshotAt: string
  phase: 'upcoming' | 'active' | 'ended'
  dayIndex: number | null
  summary: {
    participants: number
    totalCheckIns: number
    completedParticipants: number
    missedParticipants: number
    inProgressParticipants: number
    todayCheckIns: number | null
  }
  daily: { dayIndex: number; checkIns: number; closed: boolean }[]
}
