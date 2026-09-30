import { describe, expect, it } from 'vitest'

import { registerSchema, setupInitializeSchema } from '../../src/server/schemas/auth.schema'

const validInput = {
  email: 'user@qq.test',
  password: 'qianqian2026',
  displayName: '清浅',
}

describe('registerSchema', () => {
  it('接受合法输入', () => {
    const result = registerSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('拒绝纯字母或纯数字密码', () => {
    expect(registerSchema.safeParse({ ...validInput, password: 'abcdefgh' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...validInput, password: '12345678' }).success).toBe(false)
  })

  it('拒绝过短密码', () => {
    const result = registerSchema.safeParse({ ...validInput, password: 'ab12' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain('密码至少 8 位')
    }
  })

  it('拒绝非法邮箱', () => {
    const result = registerSchema.safeParse({ ...validInput, email: 'not-an-email' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain('邮箱格式无效')
    }
  })

  it('拒绝超过 20 字的昵称', () => {
    const result = registerSchema.safeParse({ ...validInput, displayName: '清'.repeat(21) })
    expect(result.success).toBe(false)
  })

  it('去除昵称首尾空格', () => {
    const result = registerSchema.safeParse({ ...validInput, displayName: '  清浅  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.displayName).toBe('清浅')
    }
  })
})

describe('setupInitializeSchema', () => {
  it('与注册使用相同的密码强度要求', () => {
    expect(setupInitializeSchema.safeParse(validInput).success).toBe(true)
    expect(setupInitializeSchema.safeParse({ ...validInput, password: 'password' }).success).toBe(
      false
    )
  })
})
