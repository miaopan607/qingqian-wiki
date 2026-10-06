import { z } from 'zod'
import { publicListQuerySchema } from './admin.schema'

export const checkInBodySchema = z
  .object({
    turnstileToken: z.string().trim().min(1).max(2048),
    dayIndex: z.number().int().min(0).max(29),
  })
  .strict()

export const adminCheckInQuerySchema = publicListQuerySchema.extend({
  q: z.string().trim().max(50).optional(),
  state: z.enum(['in_progress', 'missed', 'completed']).optional(),
})
