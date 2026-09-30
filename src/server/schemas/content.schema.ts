import { z } from 'zod'

export const GALLERY_TITLE_MAX_LENGTH = 60
export const KEYCAP_NAME_MAX_LENGTH = 60
export const CONTENT_DESCRIPTION_MAX_LENGTH = 2000
export const CONTENT_MAX_IMAGES = 50

const assetIdList = z
  .array(z.string().trim().min(1, '图片不存在'))
  .min(1, '至少上传一张图片')
  .max(CONTENT_MAX_IMAGES, `最多 ${CONTENT_MAX_IMAGES} 张图片`)

const descriptionField = z
  .string()
  .max(CONTENT_DESCRIPTION_MAX_LENGTH, `描述最多 ${CONTENT_DESCRIPTION_MAX_LENGTH} 个字符`)
  .optional()

const seqField = z.coerce
  .number({ error: '序号必须是数字' })
  .int('序号必须是整数')
  .min(1, '序号至少为 1')
  .max(9999, '序号最大为 9999')
  .optional()

export const galleryCreateSchema = z.object({
  seq: seqField,
  title: z
    .string({ error: '标题不能为空' })
    .trim()
    .min(1, '标题不能为空')
    .max(GALLERY_TITLE_MAX_LENGTH, `标题最多 ${GALLERY_TITLE_MAX_LENGTH} 个字符`),
  description: descriptionField,
  status: z.enum(['draft', 'published']).default('published'),
  assetIds: assetIdList,
})

export const galleryUpdateSchema = z
  .object({
    seq: seqField,
    title: z
      .string()
      .trim()
      .min(1, '标题不能为空')
      .max(GALLERY_TITLE_MAX_LENGTH, `标题最多 ${GALLERY_TITLE_MAX_LENGTH} 个字符`)
      .optional(),
    description: descriptionField,
    status: z.enum(['draft', 'published']).optional(),
    assetIds: assetIdList.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '没有需要更新的内容' })

export const keycapCreateSchema = z.object({
  seq: z.coerce
    .number({ error: '序号必须是数字' })
    .int('序号必须是整数')
    .min(1, '序号至少为 1')
    .max(9999, '序号最大为 9999')
    .optional(),
  name: z
    .string({ error: '名称不能为空' })
    .trim()
    .min(1, '名称不能为空')
    .max(KEYCAP_NAME_MAX_LENGTH, `名称最多 ${KEYCAP_NAME_MAX_LENGTH} 个字符`),
  description: descriptionField,
  assetIds: assetIdList,
})

export const keycapUpdateSchema = z
  .object({
    seq: z.coerce
      .number({ error: '序号必须是数字' })
      .int('序号必须是整数')
      .min(1, '序号至少为 1')
      .max(9999, '序号最大为 9999')
      .optional(),
    name: z
      .string()
      .trim()
      .min(1, '名称不能为空')
      .max(KEYCAP_NAME_MAX_LENGTH, `名称最多 ${KEYCAP_NAME_MAX_LENGTH} 个字符`)
      .optional(),
    description: descriptionField,
    assetIds: assetIdList.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: '没有需要更新的内容' })
