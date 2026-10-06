const DAY_MS = 86_400_000
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const FIRST_DATE_UTC = Date.UTC(2026, 9, 7)

// 延长时钟不对 24 小时取模，显示时才四舍五入到整秒。
export function formatCheckInScore(seconds: number): string {
  const rounded = Math.round(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remainder = rounded % 60
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':')
}

export function getCheckInDateLabel(dayIndex: number): string {
  const date = new Date(FIRST_DATE_UTC + dayIndex * DAY_MS)
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`
}

// 真实签到时间统一转为北京时间，不受浏览器或测试宿主时区影响。
export function formatCheckInDateTime(iso: string): string {
  return new Date(new Date(iso).getTime() + BEIJING_OFFSET_MS)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ')
}

export function getCheckInDayStatus(
  dayIndex: number,
  phase: 'upcoming' | 'active' | 'ended',
  currentDayIndex: number | null,
  checkedIn: boolean
): string {
  if (checkedIn) return '已签'
  if (phase === 'ended' || (phase === 'active' && dayIndex < (currentDayIndex ?? 0))) {
    return '漏签'
  }
  if (phase === 'active' && dayIndex === currentDayIndex) return '今日待签'
  return '未到'
}
