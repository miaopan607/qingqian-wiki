import { describe, expect, it } from 'vitest'
import { getCheckInScoreSeconds } from '../../src/server/services/checkIn.service'
import {
  getCheckInDayWindows,
  getCheckInWindow,
  getNextCheckInRefreshChange,
} from '../../src/lib/checkInSchedule'
import { getCheckInEvent } from '../../src/server/services/checkInEvents'
import type { CheckInRefreshChange } from '../../src/types/entities'

const current = getCheckInEvent()
const old = getCheckInEvent('2026-10-07')
describe('北京时间个人签到日', () => {
  it.each([
    [0, '2026-11-21T15:59:59Z', 'upcoming', null],
    [0, '2026-11-21T16:00:00Z', 'active', 0],
    [300, '2026-11-21T20:59:59Z', 'upcoming', null],
    [300, '2026-11-21T21:00:00Z', 'active', 0],
    [300, '2026-11-22T16:00:00Z', 'active', 0],
    [300, '2026-11-22T21:00:00Z', 'active', 1],
    [300, '2026-12-21T21:00:00Z', 'ended', null],
    [1439, '2026-12-22T15:58:59Z', 'active', 29],
    [1439, '2026-12-22T15:59:00Z', 'ended', null],
  ])('%s分钟，%s属于正确个人日', (minute, time, phase, dayIndex) => {
    expect(
      getCheckInWindow(new Date(time), getCheckInDayWindows(current, minute, []))
    ).toMatchObject({ phase, dayIndex })
  })
  it.each([
    [old, 300, '2026-10-06T21:00:00Z', 18000],
    [old, 0, '2026-10-07T17:00:00Z', 90000],
    [current, 300, '2026-11-21T21:01:00Z', 60],
    [current, 540, '2026-11-22T01:01:00Z', 60],
  ])('按活动的真实起点计算分数', (event, minute, time, expected) => {
    const now = new Date(time)
    const window = getCheckInWindow(now, getCheckInDayWindows(event, minute, []))
    expect(getCheckInScoreSeconds(now, new Date(window.dayStartsAt!), event.scoreMode)).toBe(
      expected
    )
  })
  it.each([
    ['2026-11-21T20:00:00Z', 540, 0, '2026-11-22T01:00:00.000Z'],
    ['2026-11-22T02:00:00Z', 540, 1, '2026-11-23T01:00:00.000Z'],
    ['2026-11-21T21:01:00Z', 240, 1, '2026-11-22T20:00:00.000Z'],
    ['2026-11-22T20:59:00Z', 240, 2, '2026-11-23T20:00:00.000Z'],
    ['2026-12-21T20:59:00Z', 1439, 30, '2026-12-22T15:59:00.000Z'],
    ['2026-12-21T21:00:00Z', 1439, null, null],
  ])('未来改点 %s → %s', (time, minute, fromDayIndex, effectiveAt) => {
    const next = getNextCheckInRefreshChange(current, 300, [], new Date(time), minute)
    expect(next).toEqual(fromDayIndex === null ? null : { fromDayIndex, effectiveAt })
    if (next) {
      const changes = [
        { id: 1, fromDayIndex: next.fromDayIndex, refreshMinute: minute, createdAt: time },
      ]
      const windows = getCheckInDayWindows(current, 300, changes)
      expect(windows).toHaveLength(30)
      windows.forEach((window, index) => {
        expect(Date.parse(window.endsAt)).toBeGreaterThan(Date.parse(window.startsAt))
        if (index) expect(window.startsAt).toBe(windows[index - 1].endsAt)
      })
    }
  })
  it('重复安排按最大ID覆盖未来边界，不更改过去，也不改变旧活动', () => {
    const changes: CheckInRefreshChange[] = [
      { id: 4, fromDayIndex: 1, refreshMinute: 540, createdAt: '2026-11-22T02:00:00Z' },
      { id: 7, fromDayIndex: 1, refreshMinute: 240, createdAt: '2026-11-22T03:00:00Z' },
    ]
    const windows = getCheckInDayWindows(current, 300, changes.reverse())
    expect(windows[0]).toMatchObject({
      startsAt: '2026-11-21T21:00:00.000Z',
      endsAt: '2026-11-22T20:00:00.000Z',
    })
    expect(windows[1].refreshMinute).toBe(240)
    expect(getCheckInDayWindows(old, 0, changes)[0].startsAt).toBe(old.startsAt)
    expect(getNextCheckInRefreshChange(old, 300, [], new Date(old.startsAt), 540)).toBeNull()
  })
})
