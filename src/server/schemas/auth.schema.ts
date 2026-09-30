import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 64
export const DISPLAY_NAME_MAX_LENGTH = 20
export const BIO_MAX_LENGTH = 200

const emailSchema = z.string({ error: '邮箱不能为空' }).trim().min(1, '邮箱不能为空')

export const emailFieldSchema = emailSchema.superRefine((value, ctx) => {
  if (!z.email().safeParse(value).success) {
    ctx.addIssue({ code: 'custom', message: '邮箱格式无效' })
  }
})

export const passwordSchema = z
  .string({ error: '密码不能为空' })
  .min(PASSWORD_MIN_LENGTH, `密码至少 ${PASSWORD_MIN_LENGTH} 位`)
  .max(PASSWORD_MAX_LENGTH, `密码最多 ${PASSWORD_MAX_LENGTH} 位`)
  .refine((value) => /[A-Za-z]/.test(value), '密码需包含字母')
  .refine((value) => /\d/.test(value), '密码需包含数字')

export const displayNameSchema = z
  .string({ error: '昵称不能为空' })
  .trim()
  .min(1, '昵称不能为空')
  .max(DISPLAY_NAME_MAX_LENGTH, `昵称最多 ${DISPLAY_NAME_MAX_LENGTH} 个字符`)

export const registerSchema = z.object({
  email: emailFieldSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
})

export const loginSchema = z.object({
  email: emailFieldSchema,
  password: z.string({ error: '密码不能为空' }).min(1, '密码不能为空'),
})

export const setupInitializeSchema = z.object({
  email: emailFieldSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
})
