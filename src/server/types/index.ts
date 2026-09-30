import type { Request } from 'express'

export type ApiUser = {
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

export type AuthenticatedRequest = Request & {
  authUser?: ApiUser
}
