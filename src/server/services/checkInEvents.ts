import type { CheckInEvent } from '../../types/entities'
import { AppError } from '../utils/appError'
import { CHECK_IN_DEBUG } from './checkInClock.service'

const events: CheckInEvent[] = [
  {
    id: '2026-11-22',
    debug: CHECK_IN_DEBUG,
    archived: false,
    startsOn: '2026-11-22',
    endsOn: '2026-12-22',
    startsAt: '2026-11-21T16:00:00.000Z',
    endsAt: '2026-12-22T15:59:00.000Z',
    rankingsAvailableAt: '2026-12-22T15:59:00.000Z',
    days: 30,
    fixedRefreshMinute: null,
    scoreMode: 'elapsed',
    rewardMode: 'possible',
  },
  {
    id: '2026-10-07',
    debug: CHECK_IN_DEBUG,
    archived: true,
    startsOn: '2026-10-07',
    endsOn: '2026-11-06',
    startsAt: '2026-10-06T21:00:00.000Z',
    endsAt: '2026-11-05T21:00:00.000Z',
    rankingsAvailableAt: '2026-11-05T21:00:00.000Z',
    days: 30,
    fixedRefreshMinute: 300,
    scoreMode: 'extended_clock',
    rewardMode: 'first_place',
  },
].map((event) => ({
  ...event,
  id: CHECK_IN_DEBUG ? `dev-${event.id}` : event.id,
})) as CheckInEvent[]

export function getCheckInEvents(): CheckInEvent[] {
  return events.map((event) => ({ ...event }))
}
export function getCheckInEvent(eventId?: string): CheckInEvent {
  const event = eventId === undefined ? events[0] : events.find((item) => item.id === eventId)
  if (!event) throw new AppError('签到活动不存在', 404, 'CHECK_IN_EVENT_NOT_FOUND')
  return { ...event }
}
