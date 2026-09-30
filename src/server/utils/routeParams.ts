// Express 5 的 params 值类型为 string | string[]，统一取首个值
export function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}
