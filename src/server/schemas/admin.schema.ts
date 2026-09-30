import { z } from 'zod'

export const SITE_NAME_MAX_LENGTH = 30
export const SITE_DESCRIPTION_MAX_LENGTH = 100

export const siteSettingsSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, '站点名称不能为空')
      .max(SITE_NAME_MAX_LENGTH, `站点名称最多 ${SITE_NAME_MAX_LENGTH} 个字符`)
      .optional(),
    description: z
      .string()
      .trim()
      .max(SITE_DESCRIPTION_MAX_LENGTH, `站点简介最多 ${SITE_DESCRIPTION_MAX_LENGTH} 个字符`)
      .optional(),
    registrationOpen: z.boolean().optional(),
    storageDriver: z.enum(['local', 's3']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '没有需要更新的内容' })

const pageField = z.coerce.number().int().min(1).catch(1)

export const publicListQuerySchema = z.object({
  page: pageField,
  pageSize: z.coerce.number().int().min(1).max(100).catch(24),
})

export const keycapListQuerySchema = publicListQuerySchema.omit({}).extend({
  pageSize: z.coerce.number().int().min(1).max(100).catch(50),
})

const optionalQueryString = z
  .string()
  .trim()
  .max(50, '搜索关键词过长')
  .optional()
  .transform((value) => (value ? value : undefined))

export const adminGalleryListQuerySchema = publicListQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: optionalQueryString,
  status: z.enum(['draft', 'published']).optional().catch(undefined),
})

export const adminKeycapListQuerySchema = keycapListQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: optionalQueryString,
})

export const adminUserListQuerySchema = publicListQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  q: optionalQueryString,
  role: z.enum(['user', 'admin', 'super_admin']).optional().catch(undefined),
  status: z.enum(['active', 'banned']).optional().catch(undefined),
})

export const idParamSchema = z.object({ id: z.string().trim().min(1, '记录不存在') })
export const assetIdParamSchema = z.object({ assetId: z.string().trim().min(1, '图片不存在') })
