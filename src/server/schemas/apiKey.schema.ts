import { z } from 'zod'

export const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1, '名称不能为空').max(50, '名称最多 50 个字符'),
    scope: z.enum(['read', 'read_write']).default('read'),
    expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(90),
  })
  .strict()
