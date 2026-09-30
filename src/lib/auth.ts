import { apiPatch, apiPost, apiRequest, apiUpload } from './apiClient'
import type { AuthResponse, MeResponse } from '../types/api'
import type { AuthUser } from '../types/entities'

// 登录态随时可能变化，不参与 GET 去重缓存
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const data = await apiRequest<MeResponse>('/api/auth/me', { dedup: false })
  return data.user
}

export async function loginRequest(email: string, password: string): Promise<AuthUser> {
  const data = await apiPost<AuthResponse>('/api/auth/login', { email, password })
  return data.user
}

export async function registerRequest(input: {
  email: string
  password: string
  displayName: string
}): Promise<AuthUser> {
  const data = await apiPost<AuthResponse>('/api/auth/register', input)
  return data.user
}

export async function logoutRequest(): Promise<void> {
  await apiPost('/api/auth/logout')
}

export async function updateProfileRequest(payload: {
  displayName?: string
  bio?: string
}): Promise<AuthUser> {
  const data = await apiPatch<AuthResponse>('/api/me', payload)
  return data.user
}

export async function uploadAvatarRequest(file: Blob): Promise<AuthUser> {
  const formData = new FormData()
  formData.append('file', file, 'avatar.webp')
  const data = await apiUpload<AuthResponse>('/api/me/avatar', formData)
  return data.user
}

export async function removeAvatarRequest(): Promise<AuthUser> {
  const data = await apiRequest<AuthResponse>('/api/me/avatar', { method: 'DELETE', dedup: false })
  return data.user
}
