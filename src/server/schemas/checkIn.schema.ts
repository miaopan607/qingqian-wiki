import { z } from 'zod'
import { publicListQuerySchema } from './admin.schema'

export const checkInBodySchema = z
  .object({
    turnstileToken: z.string().trim().min(1).max(2048),
    dayIndex: z.number().int().min(0).max(29),
  })
  .strict()

export const WECHAT_MAX_LENGTH = 30
export const updateCheckInProfileSchema = z.object({
  wechat: z
    .string()
    .trim()
    .max(WECHAT_MAX_LENGTH, `微信号最多 ${WECHAT_MAX_LENGTH} 个字符`)
    .regex(/^[a-zA-Z0-9_-]*$/, '微信号仅支持字母、数字、下划线与连字符')
    .nullable()
    .transform((val) => (val === '' || val === null ? null : val)),
})
export const adminCheckInQuerySchema = publicListQuerySchema.extend({
  q: z.string().trim().max(50).optional(),
  state: z.enum(['in_progress', 'missed', 'completed']).optional(),
})
