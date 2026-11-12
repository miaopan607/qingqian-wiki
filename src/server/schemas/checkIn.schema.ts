import { z } from 'zod'
import { publicListQuerySchema } from './admin.schema'

export const checkInBodySchema = z
  .object({
    turnstileToken: z.string().trim().min(1).max(2048),
    dayIndex: z.number().int().min(0).max(29),
  })
  .strict()
export const WECHAT_MAX_LENGTH = 30
const wechatSchema = z
  .string()
  .trim()
  .max(WECHAT_MAX_LENGTH, `微信号最多 ${WECHAT_MAX_LENGTH} 个字符`)
  .regex(/^[a-zA-Z0-9_-]*$/, '微信号仅支持字母、数字、下划线与连字符')
  .nullable()
  .transform((val) => (val === '' ? null : val))
const refreshMinuteSchema = z.number().int().min(0).max(1439)
const reasonSchema = z.string().trim().max(500).optional()
const eventIdSchema = z.string().min(1).max(50).optional()
export const checkInEventQuerySchema = z.object({ eventId: eventIdSchema })
export const checkInRankingQuerySchema = publicListQuerySchema.extend({ eventId: eventIdSchema })
export const updateCheckInProfileSchema = z.object({ wechat: wechatSchema }).strict()
export const checkInRefreshSchema = z.object({ refreshMinute: refreshMinuteSchema }).strict()
export const adminCheckInQuerySchema = checkInRankingQuerySchema.extend({
  q: z.string().trim().max(50).optional(),
  state: z.enum(['in_progress', 'missed', 'completed']).optional(),
})
export const adminCheckInRecordSchema = z
  .object({ checkedInAt: z.iso.datetime({ offset: true }), reason: reasonSchema })
  .strict()
export const adminCheckInDeleteSchema = z.object({ reason: reasonSchema }).strict()
export const adminCheckInProfileSchema = z
  .object({
    wechat: wechatSchema.optional(),
    refreshMinute: refreshMinuteSchema.optional(),
    reason: reasonSchema,
  })
  .strict()
  .refine(
    (input) => input.wechat !== undefined || input.refreshMinute !== undefined,
    '至少填写一项活动资料'
  )
export const checkInLogsQuerySchema = checkInRankingQuerySchema.extend({
  userUid: z.string().trim().min(1).max(100).optional(),
})
export const checkInDayIndexSchema = z.coerce.number().int().min(0).max(29)
