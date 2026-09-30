import { z } from 'zod'
import { BIO_MAX_LENGTH, displayNameSchema, passwordSchema } from './auth.schema'

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: z.string().max(BIO_MAX_LENGTH, `简介最多 ${BIO_MAX_LENGTH} 个字符`).optional(),
  })
  .refine((value) => value.displayName !== undefined || value.bio !== undefined, {
    message: '没有需要更新的内容',
  })

export const adminUpdateUserSchema = z
  .object({
    role: z.enum(['user', 'admin', 'super_admin']).optional(),
    status: z.enum(['active', 'banned']).optional(),
    banReason: z.string().trim().max(100, '封禁原因最多 100 个字符').optional(),
  })
  .refine((value) => value.role !== undefined || value.status !== undefined, {
    message: '没有需要更新的内容',
  })

export const adminResetPasswordSchema = z.object({
  password: passwordSchema,
})

export const userIdParamSchema = z.object({ uid: z.string().trim().min(1, '用户不存在') })
