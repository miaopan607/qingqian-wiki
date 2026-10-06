import { describe, expect, it } from 'vitest'
import { getCheckInWindow, getCheckInScoreSeconds } from '../../src/server/services/checkIn.service'

describe('北京时间签到日', () => {
  it.each([
    ['2026-10-06T20:59:59Z', 'upcoming', null],
    ['2026-10-06T21:00:00Z', 'active', 0],
    ['2026-10-07T16:00:00Z', 'active', 0],
    ['2026-10-07T20:59:59Z', 'active', 0],
    ['2026-10-07T21:00:00Z', 'active', 1],
    ['2026-11-05T21:00:00Z', 'ended', null],
  ])('%s属于正确活动日', (time, phase, dayIndex) => {
    expect(getCheckInWindow(new Date(time))).toMatchObject({ phase, dayIndex })
  })
  it.each([
    ['2026-10-06T21:00:00Z', 18000],
    ['2026-10-06T22:00:00Z', 21600],
    ['2026-10-07T16:00:00Z', 86400],
    ['2026-10-07T17:00:00Z', 90000],
    ['2026-10-07T20:59:59Z', 104399],
  ])('%s采用延长时钟计分', (time, expected) => {
    const now = new Date(time)
    expect(getCheckInScoreSeconds(now, getCheckInWindow(now).dayStartsAt!)).toBe(expected)
  })
})
