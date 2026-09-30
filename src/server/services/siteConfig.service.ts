import { prisma } from '../prisma'
import { SiteConfigError } from '../utils/appError'
import { isS3Configured } from './storage'

export type StorageDriverSetting = 'local' | 's3'

export type SiteSettings = {
  name: string
  description: string
  registrationOpen: boolean
  storageDriver: StorageDriverSetting
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  name: '清浅 Wiki',
  description: '清浅 · 美图与键帽档案',
  registrationOpen: true,
  storageDriver: 'local',
}

const CONFIG_KEYS = {
  name: 'site.name',
  description: 'site.description',
  registrationOpen: 'site.registrationOpen',
  storageDriver: 'storage.driver',
} as const

const CACHE_TTL_MS = 5000
let cached: { settings: SiteSettings; expiresAt: number } | null = null

export function invalidateSiteSettingsCache(): void {
  cached = null
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (cached && cached.expiresAt > Date.now()) return cached.settings

  const rows = await prisma.siteConfig.findMany()
  const valueByKey = new Map(rows.map((row) => [row.key, row.value]))

  const name = valueByKey.get(CONFIG_KEYS.name)
  const description = valueByKey.get(CONFIG_KEYS.description)
  const registrationOpen = valueByKey.get(CONFIG_KEYS.registrationOpen)
  const storageDriver = valueByKey.get(CONFIG_KEYS.storageDriver)

  const settings: SiteSettings = {
    name: typeof name === 'string' && name.trim() ? name : DEFAULT_SITE_SETTINGS.name,
    description:
      typeof description === 'string' && description.trim()
        ? description
        : DEFAULT_SITE_SETTINGS.description,
    registrationOpen:
      typeof registrationOpen === 'boolean'
        ? registrationOpen
        : DEFAULT_SITE_SETTINGS.registrationOpen,
    storageDriver: storageDriver === 's3' ? 's3' : 'local',
  }

  cached = { settings, expiresAt: Date.now() + CACHE_TTL_MS }
  return settings
}

export async function updateSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  if (patch.storageDriver === 's3' && !isS3Configured()) {
    throw new SiteConfigError('S3 未配置，无法切换到对象存储', 400)
  }

  const updates: Array<[string, unknown]> = []
  if (patch.name !== undefined) updates.push([CONFIG_KEYS.name, patch.name])
  if (patch.description !== undefined) updates.push([CONFIG_KEYS.description, patch.description])
  if (patch.registrationOpen !== undefined) {
    updates.push([CONFIG_KEYS.registrationOpen, patch.registrationOpen])
  }
  if (patch.storageDriver !== undefined)
    updates.push([CONFIG_KEYS.storageDriver, patch.storageDriver])

  for (const [key, value] of updates) {
    await prisma.siteConfig.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    })
  }

  invalidateSiteSettingsCache()
  return getSiteSettings()
}
